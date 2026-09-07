import { questionPath } from "@called-my-shot/schemas"
import { inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { emailOutbox } from "../db/schema"
import { renderEmail } from "../emails/render"
import {
	type DigestCall,
	digestSubject,
	ResolutionDigest,
} from "../emails/resolution-digest"
import { env } from "../env"
import { isMuted, mutedEmailTypesByUser } from "./email-prefs"
import { oneClickUnsubscribeUrl, unsubscribePageUrl } from "./email-unsubscribe"
import { sendMail } from "./mailer"
import { loadResolvedCallSummaries } from "./share-cards/call-summary"

// How long a user's oldest unsent row has to sit before their digest goes
// out. Waiting on the OLDEST row (rather than the newest) is what turns a
// burst of games finishing together into one email while still letting an
// afternoon result go out without waiting on an evening one.
const SETTLE_MINUTES = 15
// Rows listed in the email body; the rest become "and N more". A 12-call
// Sunday should read as a result, not a spreadsheet.
const MAX_ROWS_PER_EMAIL = 8
const MAX_USERS_PER_RUN = 200
// A row that has failed this many times is left alone rather than retried
// forever - by then it's a bad address or a template bug, and neither gets
// better on the next pass.
const MAX_ATTEMPTS = 5

type SendFn = typeof sendMail

function shareUrl(questionId: string, questionTitle: string): string {
	const path = questionPath({ id: questionId, title: questionTitle })
	// share=1 opens the share panel on arrival instead of landing on a
	// collapsed button (see the question route's validateSearch). The utm
	// params are what PostHog attributes the visit to - no client code needed,
	// it captures them on pageview.
	return `${env.CLIENT_ORIGIN}${path}?share=1&utm_source=email&utm_medium=resolution_digest`
}

// Resolved without mailing anything. sentAt is stamped alongside the reason
// so the row leaves the pending index - "we deliberately didn't send" is a
// finished state, not something to reconsider on the next pass - while
// skippedReason keeps it distinguishable from a real send.
async function markSkipped(rowIds: string[], reason: string): Promise<void> {
	if (rowIds.length === 0) return
	await db
		.update(emailOutbox)
		.set({ sentAt: new Date(), skippedReason: reason })
		.where(inArray(emailOutbox.id, rowIds))
}

// Left unsent on purpose, so the next run picks it up again - until attempts
// crosses MAX_ATTEMPTS and the claim query stops selecting it.
async function markFailed(rowIds: string[], error: string): Promise<void> {
	if (rowIds.length === 0) return
	await db
		.update(emailOutbox)
		.set({ attempts: sql`${emailOutbox.attempts} + 1`, lastError: error })
		.where(inArray(emailOutbox.id, rowIds))
}

// Drained on a cron rather than sent at resolve time - see the comment on
// emailOutbox in db/schema/email.ts for why. `send` is injectable purely so
// tests can assert on what would have gone out without a Resend key.
export async function drainResolutionDigests({
	send = sendMail,
}: {
	send?: SendFn
} = {}): Promise<{ sent: number; skipped: number }> {
	const due = await db.execute<{ user_id: string }>(sql`
		select user_id
		from email_outbox
		where sent_at is null
		group by user_id
		having min(created_at) <= now() - ${`${SETTLE_MINUTES} minutes`}::interval
		limit ${MAX_USERS_PER_RUN}
	`)

	let sent = 0
	let skipped = 0

	for (const { user_id: userId } of due.rows) {
		const result = await drainOneUser(userId, send)
		sent += result.sent
		skipped += result.skipped
	}

	if (sent > 0 || skipped > 0) {
		console.log(
			`[email-digest] users=${due.rows.length} sent=${sent} skipped=${skipped}`,
		)
	}
	return { sent, skipped }
}

async function drainOneUser(
	userId: string,
	send: SendFn,
): Promise<{ sent: number; skipped: number }> {
	// SKIP LOCKED so two runs overlapping (the scheduler has no distributed
	// lock, and Fly could run more than one machine later) can't both claim
	// the same rows and mail the same person twice.
	const claimed = await db.transaction(async (tx) => {
		const rows = await tx.execute<{ id: string; call_id: string }>(sql`
			select id, call_id
			from email_outbox
			where user_id = ${userId}
				and sent_at is null
				and attempts < ${MAX_ATTEMPTS}
			order by created_at asc
			for update skip locked
		`)
		return rows.rows
	})
	if (claimed.length === 0) return { sent: 0, skipped: 0 }

	const rowIds = claimed.map((r) => r.id)

	const user = await db.query.users.findFirst({
		where: { id: userId },
		columns: { id: true, email: true },
	})
	if (!user) {
		await markSkipped(rowIds, "user_missing")
		return { sent: 0, skipped: rowIds.length }
	}

	// Deliberately not gated on users.emailVerified. That flag exists to gate
	// question creation, not to decide who can be mailed - it defaults false
	// and only flips through the confirm flow, so treating it as a send gate
	// would silently withhold results from most of the people who signed up
	// before that flow existed. Bounce handling is Resend's suppression list,
	// not a column here.
	//
	// Checked here rather than at enqueue so an unsubscribe during the
	// settling window still counts.
	const muted = (await mutedEmailTypesByUser([userId])).get(userId)
	if (isMuted(muted, "call_resolved")) {
		await markSkipped(rowIds, "muted")
		return { sent: 0, skipped: rowIds.length }
	}

	// Re-checks that each question is still `resolved`. A dispute filed inside
	// the settling window flips it to `disputed`, at which point the result is
	// contested and the share card 404s - mailing "you called it" about it
	// would be wrong twice over. loadResolvedCallSummaries applies that gate,
	// so anything it drops is exactly what shouldn't be described.
	const summaries = await loadResolvedCallSummaries(
		claimed.map((r) => r.call_id),
	)
	const stale = claimed.filter((r) => !summaries.has(r.call_id))
	if (stale.length > 0) {
		await markSkipped(
			stale.map((r) => r.id),
			"no_longer_resolved",
		)
	}
	const live = claimed.filter((r) => summaries.has(r.call_id))
	if (live.length === 0) return { sent: 0, skipped: stale.length }

	// Biggest swing first, so the rows people read top-down lead with the
	// result they care about.
	const ordered = live
		.flatMap((r) => {
			const summary = summaries.get(r.call_id)
			return summary ? [summary] : []
		})
		.sort((a, b) => Math.abs(b.points) - Math.abs(a.points))

	const calls: DigestCall[] = ordered.slice(0, MAX_ROWS_PER_EMAIL).map((s) => ({
		questionTitle: s.questionTitle,
		leagueAbbr: s.leagueAbbr,
		shapeLabel: s.shapeLabel,
		pickLabel: s.pickLabel,
		points: s.points,
		isWin: s.isWin,
		shareUrl: shareUrl(s.questionId, s.questionTitle),
	}))

	// The card worth leading with: the biggest win if there is one, otherwise
	// the biggest miss. A loss card is still worth sharing here - the loss
	// quips are the self-deprecating half of the product's voice.
	// `ordered` is non-empty (live.length > 0 and every live row has a
	// summary); the guard is for the type, not a reachable case.
	const primary = ordered.find((s) => s.isWin) ?? ordered[0]
	if (!primary) return { sent: 0, skipped: stale.length }

	const { html, text } = await renderEmail(
		<ResolutionDigest
			calls={calls}
			overflowCount={Math.max(0, ordered.length - MAX_ROWS_PER_EMAIL)}
			primaryShareUrl={shareUrl(primary.questionId, primary.questionTitle)}
			allCallsUrl={`${env.CLIENT_ORIGIN}/my-calls`}
			manageUrl={`${env.CLIENT_ORIGIN}/settings`}
			unsubscribeUrl={unsubscribePageUrl(userId, "call_resolved")}
		/>,
	)

	const result = await send({
		to: user.email,
		from: env.EMAIL_FROM_NOTIFICATIONS,
		subject: digestSubject(calls),
		text,
		html,
		headers: {
			// Gmail and Yahoo's bulk-sender rules require one-click unsubscribe
			// on mail like this, and an easy opt-out is cheaper than a spam
			// complaint either way.
			"List-Unsubscribe": `<${oneClickUnsubscribeUrl(userId, "call_resolved")}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		},
		tags: [{ name: "type", value: "resolution_digest" }],
	})

	const liveIds = live.map((r) => r.id)
	if (!result.ok) {
		await markFailed(liveIds, result.error)
		return { sent: 0, skipped: stale.length }
	}

	await db
		.update(emailOutbox)
		.set({ sentAt: new Date() })
		.where(inArray(emailOutbox.id, liveIds))
	return { sent: liveIds.length, skipped: stale.length }
}
