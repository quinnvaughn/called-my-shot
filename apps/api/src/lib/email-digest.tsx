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
import { emailUrl, withUtm } from "./email-links"
import { isMuted, mutedEmailTypesByUser } from "./email-prefs"
import { oneClickUnsubscribeUrl, unsubscribePageUrl } from "./email-unsubscribe"
import { sendMail } from "./mailer"
import { loadResolvedCallSummaries } from "./share-cards/call-summary"

// How long a user's oldest unsent row has to sit before their digest goes
// out. Waiting on the OLDEST row (rather than the newest) is what turns a
// burst of games finishing together into one email while still letting an
// afternoon result go out without waiting on an evening one.
const SETTLE_MINUTES = 15
const MAX_USERS_PER_RUN = 200
// A row that has failed this many times is left alone rather than retried
// forever - by then it's a bad address or a template bug, and neither gets
// better on the next pass.
const MAX_ATTEMPTS = 5

type SendFn = typeof sendMail

// `content` separates the one hero button from the per-call links that point
// at the same place - without it a click breakdown can't tell whether the
// button is pulling its weight or people are picking a call out of the list.
function shareUrl(
	questionId: string,
	questionTitle: string,
	content: "hero" | "call_row",
): string {
	const path = questionPath({ id: questionId, title: questionTitle })
	// share=1 opens the share panel on arrival instead of landing on a
	// collapsed button (see the question route's validateSearch).
	return emailUrl(`${path}?share=1`, {
		campaign: "resolution_digest",
		content,
	})
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
// crosses MAX_ATTEMPTS and the claim query stops selecting it. The attempt
// itself was already spent by the claim below, so this only records why.
async function markFailed(rowIds: string[], error: string): Promise<void> {
	if (rowIds.length === 0) return
	await db
		.update(emailOutbox)
		.set({ lastError: error })
		.where(inArray(emailOutbox.id, rowIds))
}

// Drained on a cron rather than sent at resolve time - see the comment on
// emailOutbox in db/schema/email.ts for why. `send` is injectable purely so
// tests can assert on what would have gone out without a Resend key.
//
// MUST be called under DRAIN_DIGESTS_LOCK (lib/job-lock.ts). Nothing
// inside here is safe against a second concurrent drain - the row claim below
// says why - so both callers, the scheduler and the backfill script, take
// that lock by name first.
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
	// Spends the attempt up front, in the same statement that reads the rows,
	// so a run that dies between here and the send has still burned one - a
	// row that kills the process can't be retried forever.
	//
	// This is NOT what stops two runs mailing the same person: the UPDATE
	// commits immediately, which releases its row locks while the rows are
	// still `sent_at is null`, so a second run started a moment later selects
	// them again quite happily. That is exactly what shipped to production -
	// startScheduler runs on every machine (see index.ts), Fly runs more than
	// one, and the same digest went out twice. The mutual exclusion is the job
	// lease every caller of this function takes; see lib/job-lock.ts.
	const { rows: claimed } = await db.execute<{ id: string; call_id: string }>(
		sql`
			update email_outbox
			set attempts = attempts + 1
			where id in (
				select id
				from email_outbox
				where user_id = ${userId}
					and sent_at is null
					and attempts < ${MAX_ATTEMPTS}
				order by created_at asc
				for update skip locked
			)
			returning id, call_id
		`,
	)
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

	// Every resolved call, not a page of them - the template applies its own
	// display cap. Slicing here would have the record and net describe only
	// the rows that fit.
	const calls: DigestCall[] = ordered.map((s) => ({
		questionTitle: s.questionTitle,
		leagueAbbr: s.leagueAbbr,
		shapeLabel: s.shapeLabel,
		pickLabel: s.pickLabel,
		points: s.points,
		isWin: s.isWin,
		shareUrl: shareUrl(s.questionId, s.questionTitle, "call_row"),
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
			primaryShareUrl={shareUrl(
				primary.questionId,
				primary.questionTitle,
				"hero",
			)}
			allCallsUrl={emailUrl("/my-calls", {
				campaign: "resolution_digest",
				content: "all_calls",
			})}
			manageUrl={emailUrl("/settings", {
				campaign: "resolution_digest",
				content: "manage",
			})}
			logoUrl={`${env.CLIENT_ORIGIN}/email-logo.png`}
			unsubscribeUrl={withUtm(unsubscribePageUrl(userId, "call_resolved"), {
				campaign: "resolution_digest",
				content: "unsubscribe",
			})}
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
			// complaint either way. Deliberately untagged, unlike the footer
			// link: nothing renders a pageview here, the mail client POSTs it
			// on the reader's behalf, so utm params would only add noise to a
			// url that has to stay exactly parseable by someone else's code.
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
