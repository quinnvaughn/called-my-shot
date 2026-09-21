import { type AchievementKind, achievementText } from "@called-my-shot/schemas"
import { and, eq, inArray, sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../db"
import { achievementNotices, emailOutbox } from "../db/schema"
import {
	type DigestAchievement,
	type DigestCall,
	digestSubject,
	ResolutionDigest,
} from "../emails/resolution-digest"
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
	utcTimestamp,
} from "./outbox"
import { loadResolvedCallSummaries } from "./share-cards/call-summary"

// How long a user's oldest unsent row has to sit before their digest can go
// out, so a dispute filed right after a resolve still has a chance to stop
// the mail.
const SETTLE_MINUTES = 15
// The digest day runs from 13:00 UTC (9am Eastern) to 13:00 UTC, not midnight
// to midnight, so a West Coast game ending at 1am Eastern still belongs to the
// night it was played. Within a day, a user's results wait until none of their
// calls on that day's games are still open - "my night's results" in one
// email, whether the night had one game or eight. Anything still waiting at
// the next 13:00 goes out regardless, so a game that never settles (a creator
// who doesn't grade, a delayed auto-resolve) costs at most one morning.
const DAY_START_HOUR_UTC = 13
const MAX_USERS_PER_RUN = 200

const OUTBOX: Outbox<typeof emailOutbox> = {
	table: emailOutbox,
	key: [emailOutbox.id],
	maxAttempts: 5,
}

const rowsIn = (rows: { id: string }[]) =>
	inArray(
		emailOutbox.id,
		rows.map((row) => row.id),
	)

// The call's own permanent page - the record of that one call, which is what
// there is to share. This used to point at the question page with ?share=1 to
// pop open a panel offering a downloadable PNG; there is no such panel now,
// and the link itself is the thing worth sending.
//
// `content` separates the one hero button from the per-call links that point
// at the same place - without it a click breakdown can't tell whether the
// button is pulling its weight or people are picking a call out of the list.
function callUrl(callId: string, content: "hero" | "call_row"): string {
	return emailUrl(`/calls/${callId}`, {
		campaign: "resolution_digest",
		content,
	})
}

// A sweep or streak line only ever rides along with a digest of results - it
// never sends an email of its own. One that finds no digest to join within
// this long stays an in-app notification only, rather than turning up in a
// results email days after the fact.
const ACHIEVEMENT_WINDOW_HOURS = 36

// The user's sweep and streak events not yet in any email, each as its line
// and a link to the page that shows it off.
async function loadDigestAchievements(
	userId: string,
	username: string,
	now: Date,
): Promise<{ dedupeKey: string; achievement: DigestAchievement }[]> {
	const rows = await db.query.achievementNotices.findMany({
		where: {
			userId,
			emailedAt: { isNull: true },
			notificationId: { isNotNull: true },
			createdAt: {
				gte: new Date(
					now.getTime() - ACHIEVEMENT_WINDOW_HOURS * 60 * 60 * 1000,
				),
			},
		},
		orderBy: { createdAt: "asc" },
		with: {
			notification: { with: { league: { columns: { slug: true } } } },
		},
	})

	return rows.flatMap(({ dedupeKey, notification: n }) => {
		const leagueSlug = n?.league?.slug
		if (!n || !leagueSlug) return []
		const target = match(n.type)
			.with("sweep_completed", (kind) =>
				n.slateKey
					? {
							kind,
							path: `/user/${username}/sweeps/${leagueSlug}/${n.slateKey}`,
						}
					: null,
			)
			.with(
				"streak_milestone",
				"streak_personal_best",
				"streak_snapped",
				(kind) =>
					n.streakFamily
						? {
								kind,
								path: `/user/${username}/streaks/${leagueSlug}/${n.streakFamily}`,
							}
						: null,
			)
			.otherwise(() => null)
		if (!target) return []
		const kind: AchievementKind = target.kind
		return [
			{
				dedupeKey,
				achievement: {
					text: achievementText({
						kind,
						label: n.achievementLabel ?? "",
						count: n.achievementCount ?? 0,
						previousBest: n.previousBest,
					}),
					url: emailUrl(target.path, {
						campaign: "resolution_digest",
						content: "achievement",
					}),
				},
			},
		]
	})
}

// Drained on a cron rather than sent at resolve time - see the comment on
// emailOutbox in db/schema/email.ts for why. `send` is injectable purely so
// tests can assert on what would have gone out without a Resend key, and
// `now` so they can place rows and games either side of a day boundary
// without depending on the time of day the suite runs.
//
// MUST be called under DRAIN_DIGESTS_LOCK (lib/job-lock.ts). Nothing
// inside here is safe against a second concurrent drain - claimOutboxRows
// (lib/outbox.ts) says why - so both callers, the scheduler and the backfill script, take
// that lock by name first.
export async function drainResolutionDigests({
	send = sendMail,
	now = new Date(),
}: {
	send?: SendFn
	now?: Date
} = {}): Promise<{ sent: number; skipped: number }> {
	const nowUtc = utcTimestamp(now)
	const due = await db.execute<{ user_id: string }>(sql`
		with digest_day as (
			select date_trunc('day', ${nowUtc} - ${`${DAY_START_HOUR_UTC} hours`}::interval)
				+ ${`${DAY_START_HOUR_UTC} hours`}::interval as starts_at
		)
		select o.user_id
		from email_outbox o
		cross join digest_day d
		where o.sent_at is null
		group by o.user_id, d.starts_at
		having min(o.created_at) <= ${nowUtc} - ${`${SETTLE_MINUTES} minutes`}::interval
			and (
				-- Waiting since before today began: the morning backstop.
				min(o.created_at) <= d.starts_at
				-- Otherwise only once nothing on today's slate is still open.
				-- Unstarted games count too, so a 1pm result waits for the same
				-- person's 7pm game rather than going out alone. Disputed and
				-- voided questions don't hold anything up.
				or not exists (
					select 1
					from calls c
					join questions q on q.id = c.question_id
					join games g on g.id = q.game_id
					where c.user_id = o.user_id
						and q.status in ('open', 'locked')
						and g.starts_at >= d.starts_at
						and g.starts_at < d.starts_at + interval '1 day'
				)
			)
		limit ${MAX_USERS_PER_RUN}
	`)

	let sent = 0
	let skipped = 0

	for (const { user_id: userId } of due.rows) {
		const result = await drainOneUser(userId, send, now)
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
	now: Date,
): Promise<{ sent: number; skipped: number }> {
	const claimed = await claimOutboxRows(OUTBOX, {
		where: eq(emailOutbox.userId, userId),
	})
	if (claimed.length === 0) return { sent: 0, skipped: 0 }

	// Deliberately not gated on users.emailVerified. That flag exists to gate
	// question creation, not to decide who can be mailed - it defaults false
	// and only flips through the confirm flow, so treating it as a send gate
	// would silently withhold results from most of the people who signed up
	// before that flow existed. Bounce handling is Resend's suppression list,
	// not a column here.
	const user = (await loadRecipients([userId], "call_resolved")).get(userId)
	if (!user || user.muted) {
		await markOutboxDone(emailOutbox, rowsIn(claimed), {
			now,
			skippedReason: user ? "muted" : "user_missing",
		})
		return { sent: 0, skipped: claimed.length }
	}

	// Re-checks that each question is still `resolved`. A dispute filed inside
	// the settling window flips it to `disputed`, at which point the result is
	// contested and mailing "you called it" about it would be wrong.
	// loadResolvedCallSummaries applies that gate, so anything it drops is
	// exactly what shouldn't be described. Note the call PAGE stays reachable
	// for those - it just shows no outcome; it's the email's claim about an
	// outcome that has to be withheld.
	const summaries = await loadResolvedCallSummaries(
		claimed.map((r) => r.callId),
	)
	const stale = claimed.filter((r) => !summaries.has(r.callId))
	if (stale.length > 0) {
		await markOutboxDone(emailOutbox, rowsIn(stale), {
			now,
			skippedReason: "no_longer_resolved",
		})
	}
	const live = claimed.filter((r) => summaries.has(r.callId))
	if (live.length === 0) return { sent: 0, skipped: stale.length }

	// Biggest swing first, so the rows people read top-down lead with the
	// result they care about.
	const ordered = live
		.flatMap((r) => {
			const summary = summaries.get(r.callId)
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
		marginLabel: s.margin?.label ?? null,
		callUrl: callUrl(s.callId, "call_row"),
	}))

	// The card worth leading with: the biggest win if there is one, otherwise
	// the biggest miss. A loss card is still worth sharing here - the loss
	// quips are the self-deprecating half of the product's voice.
	// `ordered` is non-empty (live.length > 0 and every live row has a
	// summary); the guard is for the type, not a reachable case.
	const primary = ordered.find((s) => s.isWin) ?? ordered[0]
	if (!primary) return { sent: 0, skipped: stale.length }

	const achievements = await loadDigestAchievements(userId, user.username, now)

	const result = await sendListEmail(
		{
			userId,
			to: user.email,
			type: "call_resolved",
			campaign: "resolution_digest",
			from: env.EMAIL_FROM_NOTIFICATIONS,
			subject: digestSubject(calls),
			render: (links) => (
				<ResolutionDigest
					{...links}
					calls={calls}
					achievements={achievements.map((a) => a.achievement)}
					primaryCallUrl={callUrl(primary.callId, "hero")}
					allCallsUrl={emailUrl("/my-calls", {
						campaign: "resolution_digest",
						content: "all_calls",
					})}
				/>
			),
		},
		send,
	)

	if (!result.ok) {
		await markOutboxFailed(emailOutbox, rowsIn(live), result.error)
		return { sent: 0, skipped: stale.length }
	}

	await markOutboxDone(emailOutbox, rowsIn(live), { now })
	if (achievements.length > 0) {
		await db
			.update(achievementNotices)
			.set({ emailedAt: now })
			.where(
				and(
					eq(achievementNotices.userId, userId),
					inArray(
						achievementNotices.dedupeKey,
						achievements.map((a) => a.dedupeKey),
					),
				),
			)
	}
	return { sent: live.length, skipped: stale.length }
}
