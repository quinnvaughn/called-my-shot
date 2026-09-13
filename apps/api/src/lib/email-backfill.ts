import { and, inArray, isNull, sql } from "drizzle-orm"
import { db } from "../db"
import { emailOutbox } from "../db/schema"
import { enqueueResolvedCallEmails } from "./email-outbox"
import { loadResolvedCallSummaries } from "./share-cards/call-summary"

// Queues result emails for calls that resolved BEFORE the digest existed -
// anyone who signed up and called a game that same night was scored normally
// but had nothing to send them, because there was no outbox yet.
//
// Only inserts rows. Everything after that is the ordinary drain
// (email-digest.tsx): it groups per user, honours opt-outs as of send time,
// re-checks each question is still resolved, and applies the same per-email
// cap. So this cannot send anything the live path wouldn't, and a user with
// six backfilled calls gets one email rather than six.
//
// Rows land with created_at = now, so nothing goes out until they clear the
// settling window - which doubles as an abort window.

type Candidate = { call_id: string; user_id: string; question_id: string }

export type BackfillOptions = {
	days: number
	// A username or email. Restricts the whole run to that one account, for
	// smoke-testing the real thing in production before anyone else gets it.
	onlyUser?: string
	// Backdates the queued rows past the settling window and the last morning
	// backstop, so the next drain tick sends them even if the account still has
	// open calls on today's games. Only honoured alongside
	// onlyUser: the wait is the abort window for a real backfill, and giving
	// that up for a one-person test is fine, for a whole cohort is not.
	immediate?: boolean
	// Scopes to accounts created inside the same window - the population this
	// was written for. Without it, long-standing users also get a digest for
	// results they already watched land in-app.
	newUsersOnly?: boolean
	commit?: boolean
}

export type BackfillResult = {
	candidates: number
	// Dropped because the loader can't describe them: no final points, or the
	// question is no longer resolved. Filtered here rather than left to become
	// rows the drain silently skips later.
	dropped: number
	queued: number
	callsByUser: Map<string, number>
}

export async function backfillResolutionEmails({
	days,
	onlyUser,
	immediate = false,
	newUsersOnly = false,
	commit = false,
}: BackfillOptions): Promise<BackfillResult> {
	const window = `${days} days`
	const sendNow = immediate && Boolean(onlyUser)

	const { rows: candidates } = await db.execute<Candidate>(sql`
		select c.id as call_id, c.user_id, c.question_id
		from calls c
		join questions q on q.id = c.question_id
		join users u on u.id = c.user_id
		where q.status = 'resolved'
			and q.resolved_at >= now() - ${window}::interval
			${newUsersOnly ? sql`and u.created_at >= now() - ${window}::interval` : sql``}
			${onlyUser ? sql`and (u.username = ${onlyUser} or u.email = ${onlyUser})` : sql``}
			-- Any existing row means this call was already queued or already
			-- mailed. The partial unique index only guards the unsent case, so
			-- a previously-sent row would otherwise let a second email through.
			and not exists (
				select 1 from email_outbox o where o.call_id = c.id
			)
	`)

	const summaries = await loadResolvedCallSummaries(
		candidates.map((c) => c.call_id),
	)
	const sendable = candidates.filter((c) => summaries.has(c.call_id))

	const callsByUser = new Map<string, number>()
	for (const c of sendable) {
		callsByUser.set(c.user_id, (callsByUser.get(c.user_id) ?? 0) + 1)
	}

	const result: BackfillResult = {
		candidates: candidates.length,
		dropped: candidates.length - sendable.length,
		queued: commit ? sendable.length : 0,
		callsByUser,
	}
	if (!commit) return result

	const CHUNK = 500
	for (let i = 0; i < sendable.length; i += CHUNK) {
		const chunk = sendable.slice(i, i + CHUNK)
		await db.transaction((tx) =>
			enqueueResolvedCallEmails(
				tx,
				chunk.map((c) => ({
					userId: c.user_id,
					questionId: c.question_id,
					callId: c.call_id,
				})),
			),
		)
	}

	if (sendNow && sendable.length > 0) {
		await db
			.update(emailOutbox)
			// A full day back is always before the most recent backstop.
			.set({ createdAt: sql`now() - interval '1 day'` })
			.where(
				and(
					isNull(emailOutbox.sentAt),
					inArray(
						emailOutbox.callId,
						sendable.map((c) => c.call_id),
					),
				),
			)
	}
	return result
}
