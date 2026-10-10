import { and, eq, inArray, isNotNull, or, type SQL, sql } from "drizzle-orm"
import { db } from "../db"
import { type Update, updateEmails, updates } from "../db/schema"
import { absolutizeLinks, ProductUpdate } from "../emails/product-update"
import { env } from "../env"
import { emailUrl } from "./email-links"
import { loadRecipients } from "./email-prefs"
import { type SendFn, sendListEmail } from "./email-send"
import { sendMail } from "./mailer"
import {
	claimOutboxRows,
	markOutboxDone,
	markOutboxFailed,
	type Outbox,
} from "./outbox"
import { markPending } from "./pending-work"
import { imageUrl } from "./storage"

// Same ceiling and reasoning as the season-start drain's: sending queues a row
// per user in one pass, and the drain spreads them over the */5 ticks.
const MAX_EMAILS_PER_RUN = 100

const OUTBOX: Outbox<typeof updateEmails> = {
	table: updateEmails,
	key: [updateEmails.userId, updateEmails.updateId],
	maxAttempts: 5,
}

export type EnqueueUpdateResult =
	| { ok: true; queued: number }
	| { ok: false; error: string }

// Queues the update for everyone subscribed. Refuses a draft, and refuses a
// second send of the same update - emailedAt is stamped in the same
// transaction, so two admins pressing send at once still queue it once.
export async function enqueueUpdateEmails(
	updateId: string,
	now = new Date(),
): Promise<EnqueueUpdateResult> {
	const result = await db.transaction(async (tx) => {
		const [claimed] = await tx
			.update(updates)
			.set({ emailedAt: now })
			.where(
				and(
					eq(updates.id, updateId),
					isNotNull(updates.publishedAt),
					sql`${updates.emailedAt} is null`,
				),
			)
			.returning({ id: updates.id })
		if (!claimed) return null

		// Bounced addresses are left out at enqueue for the reason the
		// season-start email gives (lib/season-start-email.tsx): a whole-list
		// send is where a pile of hard bounces becomes a reputation problem.
		// Opt-outs are filtered here and re-checked at send time.
		const { rowCount } = await tx.execute(sql`
			insert into update_emails (user_id, update_id)
			select u.id, ${updateId}
			from users u
			where u.email_bounced_at is null
				and not exists (
					select 1 from email_opt_outs o
					where o.user_id = u.id and o.type in ('all', 'product_updates')
				)
			on conflict (user_id, update_id) do nothing
		`)
		return rowCount ?? 0
	})
	if (result === null) {
		const update = await db.query.updates.findFirst({
			where: { id: updateId },
			columns: { publishedAt: true, emailedAt: true },
		})
		if (!update) return { ok: false, error: "Update not found." }
		if (!update.publishedAt)
			return { ok: false, error: "Publish it before emailing it." }
		return { ok: false, error: "This update has already been emailed." }
	}
	if (result > 0) markPending("updates")
	console.log(`[updates] queued ${result} email(s) for update ${updateId}`)
	return { ok: true, queued: result }
}

type Claimed = { userId: string; updateId: string }

const rowsIn = (rows: Claimed[]) =>
	or(
		...rows.map((row) =>
			and(
				eq(updateEmails.userId, row.userId),
				eq(updateEmails.updateId, row.updateId),
			),
		),
	) as SQL

// MUST be called under DRAIN_UPDATE_EMAILS_LOCK (lib/job-lock.ts), for the
// same reason as drainSeasonStartEmails: nothing here is safe against a
// second concurrent drain, and this one mails the whole list.
export async function drainUpdateEmails({
	send = sendMail,
	limit = MAX_EMAILS_PER_RUN,
	now = new Date(),
}: {
	send?: SendFn
	limit?: number
	now?: Date
} = {}): Promise<{ sent: number; skipped: number; failed: number }> {
	const claimed = await claimOutboxRows(OUTBOX, { limit })
	if (claimed.length === 0) return { sent: 0, skipped: 0, failed: 0 }

	const updateIds = [...new Set(claimed.map((r) => r.updateId))]
	const userIds = [...new Set(claimed.map((r) => r.userId))]

	// Read at send time, so an edit made after pressing send goes out as
	// edited, and an update unpublished in between stops going out.
	const rows = await db
		.select()
		.from(updates)
		.where(and(inArray(updates.id, updateIds), isNotNull(updates.publishedAt)))
	const byId = new Map(rows.map((u) => [u.id, u]))

	const recipients = await loadRecipients(userIds, "product_updates")

	const skipReason = (row: Claimed): string | null => {
		if (!byId.has(row.updateId)) return "update_unpublished"
		const recipient = recipients.get(row.userId)
		if (!recipient) return "user_missing"
		return recipient.muted ? "muted" : null
	}
	const skippedByReason = new Map<string, Claimed[]>()
	const sendable: Claimed[] = []
	for (const row of claimed) {
		const reason = skipReason(row)
		if (reason)
			skippedByReason.set(reason, [...(skippedByReason.get(reason) ?? []), row])
		else sendable.push(row)
	}
	for (const [reason, skippedRows] of skippedByReason) {
		await markOutboxDone(updateEmails, rowsIn(skippedRows), {
			now,
			skippedReason: reason,
		})
	}
	const skipped = claimed.length - sendable.length

	let sent = 0
	let failed = 0
	for (const row of sendable) {
		const update = byId.get(row.updateId)
		const recipient = recipients.get(row.userId)
		// Both guaranteed present by skipReason.
		if (!update || !recipient) continue

		const result = await sendUpdate({
			update,
			userId: row.userId,
			to: recipient.email,
			send,
		})
		if (result.ok) {
			sent += 1
			await markOutboxDone(updateEmails, rowsIn([row]), { now })
		} else {
			failed += 1
			await markOutboxFailed(updateEmails, rowsIn([row]), result.error)
		}
	}

	console.log(
		`[updates] claimed=${claimed.length} sent=${sent} skipped=${skipped} failed=${failed}`,
	)
	return { sent, skipped, failed }
}

function sendUpdate({
	update,
	userId,
	to,
	send,
	subjectPrefix = "",
}: {
	update: Update
	userId: string
	to: string
	send: SendFn
	subjectPrefix?: string
}) {
	const campaign = "product_update" as const
	// A draft has no slug yet, which only a test send can hit; its button goes
	// to the list instead.
	const path = update.slug ? `/updates/${update.slug}` : "/updates"
	const props = {
		title: update.title,
		summary: update.summary,
		body: absolutizeLinks(update.body, env.CLIENT_ORIGIN),
		coverImageUrl: imageUrl(update.coverImageKey),
		updateUrl: emailUrl(path, { campaign, content: "hero" }),
	}
	return sendListEmail(
		{
			userId,
			to,
			type: "product_updates",
			campaign,
			from: env.EMAIL_FROM_ANNOUNCEMENTS,
			subject: `${subjectPrefix}${update.title}`,
			render: (links) => <ProductUpdate {...props} {...links} />,
		},
		send,
	)
}

// The email exactly as it would go out, mailed to one person now. Touches no
// outbox row and works on drafts, so it can be sent as often as needed while
// the post is being written.
export async function sendUpdateTestEmail({
	updateId,
	userId,
	to,
	send = sendMail,
}: {
	updateId: string
	userId: string
	to: string
	send?: SendFn
}) {
	const update = await db.query.updates.findFirst({ where: { id: updateId } })
	if (!update) return { ok: false as const, error: "Update not found." }
	return sendUpdate({ update, userId, to, send, subjectPrefix: "[Test] " })
}
