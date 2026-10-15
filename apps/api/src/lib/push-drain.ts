import { and, eq, isNull, lt, lte, sql } from "drizzle-orm"
import { db } from "../db"
import { type PushOutboxRow, pushOutbox } from "../db/schema"
import {
	claimOutboxRows,
	markOutboxDone,
	markOutboxFailed,
	type Outbox,
} from "./outbox"
import { markPending } from "./pending-work"
import { buildPushContent } from "./push-content"
import { PUSH_POLICY } from "./push-outbox"
import { isPushMuted, loadPushMutes } from "./push-prefs"
import { deliverPush, type PushSendFn, webPushSend } from "./push-send"
import { loadLiveSubscriptions } from "./push-subscriptions"
import { HOUR_MS } from "./time"

const OUTBOX: Outbox<typeof pushOutbox> = {
	table: pushOutbox,
	key: [pushOutbox.id],
	// A push that keeps failing past a few minutely retries is a broken
	// endpoint or a payload bug, and its moment has passed either way.
	maxAttempts: 5,
}

const BATCH = 500

// A row this old says something that stopped being news - the backstop
// sweep finding one a restart stranded, say. Finished without sending.
const STALE_MS = 6 * HOUR_MS

const byId = (row: PushOutboxRow) => eq(pushOutbox.id, row.id)

// The words last pushed for each (user, key) among these rows' keys, so a row
// that would say the same thing again - a presser opening re-fires its game's
// notification, a re-resolve that changed nothing - is dropped rather than
// buzzing the phone twice.
async function loadLastSent(
	rows: PushOutboxRow[],
): Promise<Map<string, { title: string; body: string }>> {
	const last = new Map<string, { title: string; body: string }>()
	if (rows.length === 0) return last
	const pairs = sql.join(
		rows.map((row) => sql`(${row.userId}::uuid, ${row.collapseKey})`),
		sql`, `,
	)
	const { rows: sent } = await db.execute<{
		user_id: string
		collapse_key: string
		title: string
		body: string
	}>(sql`
		select distinct on (user_id, collapse_key) user_id, collapse_key, title, body
		from push_outbox
		where sent_at is not null
			and title is not null
			and (user_id, collapse_key) in (${pairs})
		order by user_id, collapse_key, sent_at desc
	`)
	for (const row of sent) {
		last.set(`${row.user_id}:${row.collapse_key}`, {
			title: row.title,
			body: row.body,
		})
	}
	return last
}

// MUST be called under DRAIN_PUSH_LOCK (lib/job-lock.ts), for the same reason
// as every other drain: claimOutboxRows is not mutual exclusion.
export async function drainPushOutbox({
	send = webPushSend,
	now = new Date(),
}: {
	send?: PushSendFn
	now?: Date
} = {}): Promise<{ sent: number; skipped: number; failed: number }> {
	const claimed = await claimOutboxRows(OUTBOX, {
		where: lte(pushOutbox.sendAfter, now),
		limit: BATCH,
	})

	let sent = 0
	let skipped = 0
	let failed = 0
	if (claimed.length > 0) {
		const userIds = [...new Set(claimed.map((row) => row.userId))]
		const [notificationRows, subscriptions, mutes, lastSent] =
			await Promise.all([
				db.query.notifications.findMany({
					where: { id: { in: claimed.map((row) => row.notificationId) } },
				}),
				loadLiveSubscriptions(userIds, now),
				loadPushMutes(userIds),
				loadLastSent(claimed),
			])
		const notifications = new Map(notificationRows.map((n) => [n.id, n]))

		const skip = async (row: PushOutboxRow, reason: string) => {
			await markOutboxDone(pushOutbox, byId(row), {
				now,
				skippedReason: reason,
			})
			skipped += 1
		}

		for (const row of claimed) {
			const notification = notifications.get(row.notificationId)
			const targets = subscriptions.get(row.userId) ?? []
			const policy = PUSH_POLICY[row.type]
			if (now.getTime() - row.createdAt.getTime() > STALE_MS) {
				await skip(row, "stale")
				continue
			}
			if (!notification || !policy) {
				await skip(row, "gone")
				continue
			}
			if (isPushMuted(mutes.get(row.userId), row.type)) {
				await skip(row, "muted")
				continue
			}
			if (targets.length === 0) {
				await skip(row, "no_subscription")
				continue
			}
			if (notification.readAt && notification.readAt >= row.createdAt) {
				await skip(row, "seen_in_app")
				continue
			}

			const content = await buildPushContent(notification)
			if (!content) {
				await skip(row, "gone")
				continue
			}
			const previous = lastSent.get(`${row.userId}:${row.collapseKey}`)
			if (
				previous &&
				previous.title === content.title &&
				previous.body === content.body
			) {
				await skip(row, "unchanged")
				continue
			}

			const result = await deliverPush(
				targets,
				{
					...content,
					tag: row.collapseKey,
					type: row.type,
					notificationIds: [notification.id],
				},
				{ ttl: policy.ttlSeconds, urgency: policy.urgency },
				send,
				now,
			)
			if (result.delivered > 0) {
				await db
					.update(pushOutbox)
					.set({
						sentAt: now,
						skippedReason: null,
						deliveredCount: result.delivered,
						title: content.title,
						body: content.body,
					})
					.where(byId(row))
				sent += 1
			} else if (result.failed === 0) {
				// Every device's subscription turned out to be gone.
				await skip(row, "no_subscription")
			} else {
				await markOutboxFailed(pushOutbox, byId(row), result.error ?? "unknown")
				failed += 1
			}
		}
		console.log(
			`[push] claimed=${claimed.length} sent=${sent} skipped=${skipped} failed=${failed}`,
		)
	}

	// Rows still waiting - a hold not over yet, a retry, a batch past the cap -
	// keep the gate open for the next minute's tick.
	const waiting = await db
		.select({ id: pushOutbox.id })
		.from(pushOutbox)
		.where(
			and(
				isNull(pushOutbox.sentAt),
				lt(pushOutbox.attempts, OUTBOX.maxAttempts),
			),
		)
		.limit(1)
	if (waiting.length > 0) markPending("push", now)

	return { sent, skipped, failed }
}
