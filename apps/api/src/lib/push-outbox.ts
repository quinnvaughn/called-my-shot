import { sql } from "drizzle-orm"
import { type Notification, pushOutbox } from "../db/schema"
import type { Tx } from "../db/types"
import { markPending } from "./pending-work"
import { pushConfigured } from "./push-send"
import { usersWithSubscriptions } from "./push-subscriptions"
import { MINUTE_MS } from "./time"

type NotificationType = Notification["type"]

export type PushPolicy = {
	// How long a push waits for more of the same before it goes out. A game's
	// questions settle one after another inside a tick, and a streak or presser
	// can follow a minute later; the hold folds them into one push.
	holdMs: number
	// How long a push service keeps trying an offline device. Results go
	// stale faster than someone joining a group.
	ttlSeconds: number
	urgency: "normal" | "high"
}

const RESULT: PushPolicy = {
	holdMs: 2 * MINUTE_MS,
	ttlSeconds: 12 * 60 * 60,
	urgency: "normal",
}
const SHORT_HOLD: PushPolicy = {
	holdMs: MINUTE_MS,
	ttlSeconds: 12 * 60 * 60,
	urgency: "normal",
}
const NOW: PushPolicy = {
	holdMs: 0,
	ttlSeconds: 24 * 60 * 60,
	urgency: "normal",
}

// Every notification type, so a new one has to decide. Null is never queued
// here: game_reminder is pushed by its own drain (lib/game-reminders.tsx),
// which needs to know whether a push landed before deciding to email, and
// group_pins_expired is housekeeping for admins that can wait for the inbox.
export const PUSH_POLICY: Record<NotificationType, PushPolicy | null> = {
	game_resolved: RESULT,
	sweep_completed: RESULT,
	call_resolved: SHORT_HOLD,
	challenge_accepted: SHORT_HOLD,
	presser_question_received: SHORT_HOLD,
	dispute_filed: NOW,
	dispute_upheld: NOW,
	dispute_overturned: NOW,
	question_voided: NOW,
	call_voided: NOW,
	group_member_joined: NOW,
	question_shared_to_group: NOW,
	streak_milestone: NOW,
	streak_personal_best: NOW,
	streak_snapped: NOW,
	redo_earned: NOW,
	call_faded: NOW,
	fade_gloated: NOW,
	presser_answered: NOW,
	challenge_settled: NOW,
	challenge_gloated: NOW,
	challenge_posted_to_group: NOW,
	game_reminder: null,
	group_pins_expired: null,
}

// Rows sharing a key fold into one push. Also the device-side tag, so a later
// push for the same key replaces the earlier one on the lock screen.
export type PushKeyFields = Pick<
	Notification,
	"id" | "type" | "gameId" | "callId" | "leagueId" | "slateKey" | "dedupeKey"
>

export function collapseKeyFor(n: PushKeyFields): string {
	if (n.type === "game_resolved" && n.gameId) return `game:${n.gameId}`
	if (n.type === "call_resolved") return `call:${n.callId ?? n.id}`
	if (n.type === "sweep_completed" && n.leagueId && n.slateKey) {
		return `sweep:${n.leagueId}:${n.slateKey}`
	}
	return n.dedupeKey ?? `n:${n.id}`
}

// Never later than this after a row was first queued, however many more
// events keep extending its hold.
const MAX_HOLD_MS = 10 * MINUTE_MS

// Called by createNotifications in the same transaction as the rows it just
// wrote. Only users with a device get a row, so most notifications cost one
// indexed lookup and nothing else.
export async function enqueuePushes(
	tx: Tx,
	rows: (PushKeyFields & { userId: string })[],
	now: Date,
): Promise<void> {
	if (!pushConfigured()) return
	const eligible = rows.filter((row) => PUSH_POLICY[row.type] !== null)
	if (eligible.length === 0) return
	const reachable = await usersWithSubscriptions(tx, [
		...new Set(eligible.map((row) => row.userId)),
	])
	const values = [
		...new Map(
			eligible
				.filter((row) => reachable.has(row.userId))
				.map((row) => {
					const policy = PUSH_POLICY[row.type] as PushPolicy
					const collapseKey = collapseKeyFor(row)
					return [
						`${row.userId}:${collapseKey}`,
						{
							userId: row.userId,
							type: row.type,
							notificationId: row.id,
							collapseKey,
							sendAfter: new Date(now.getTime() + policy.holdMs),
							createdAt: now,
						},
					] as const
				}),
		).values(),
	]
	if (values.length === 0) return

	await tx
		.insert(pushOutbox)
		.values(values)
		.onConflictDoUpdate({
			target: [pushOutbox.userId, pushOutbox.collapseKey],
			targetWhere: sql`sent_at is null`,
			set: {
				notificationId: sql`excluded.notification_id`,
				type: sql`excluded.type`,
				sendAfter: sql`least(excluded.send_after, ${pushOutbox.createdAt} + ${MAX_HOLD_MS} * interval '1 millisecond')`,
			},
		})
	markPending("push", now)
}
