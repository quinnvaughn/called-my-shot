import { type AchievementKind, achievementText } from "@called-my-shot/schemas"
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../db"
import {
	achievementNotices,
	emailOutbox,
	notifications,
	pushOutbox,
	questions,
} from "../db/schema"
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
import { noticeRun } from "./streaks/notices"

// How long a user's oldest unsent row has to sit before their digest can go
// out, so a dispute filed right after a resolve still has a chance to stop
// the mail.
export const SETTLE_MINUTES = 15
// At most one results email a day. The digest day runs from 13:00 UTC (9am
// Eastern) to 13:00 UTC, not midnight to midnight, so a West Coast game ending
// at 1am Eastern still belongs to the night it was played. A user's day goes
// out once it's done: none of their calls on that day's games still open, and
// no game that day still to finish in a league they called. Anything that
// settles after that send, and anything still waiting when the next day
// starts (a creator who doesn't grade, a delayed auto-resolve), goes out at
// the next 13:00.
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
function callUrl(
	callId: string,
	content: "hero" | "call_row",
): string {
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

// Rows the user has already been told about another way, and how. "seen_in_app"
// is a game whose game_resolved notification they've read: every result that
// lands on it marks it unread again, so a read one means they've seen
// everything on that game up to the moment they read it. "pushed" is a result
// a device accepted a push for after the row was queued - the game's push for a
// game question, the call's own for one with no game. A push skipped as
// "unchanged" counts too, since it was skipped for repeating one that went out.
type AlreadyTold = "seen_in_app" | "pushed"

async function loadAlreadyTold(
	userId: string,
	rows: { id: string }[],
): Promise<Map<string, AlreadyTold>> {
	const seen = await db
		.select({ id: emailOutbox.id })
		.from(emailOutbox)
		.innerJoin(questions, eq(questions.id, emailOutbox.questionId))
		.innerJoin(
			notifications,
			and(
				eq(notifications.userId, userId),
				eq(notifications.type, "game_resolved"),
				eq(notifications.gameId, questions.gameId),
				gte(notifications.readAt, emailOutbox.createdAt),
			),
		)
		.where(rowsIn(rows))
	const pushed = await db
		.select({ id: emailOutbox.id })
		.from(emailOutbox)
		.innerJoin(questions, eq(questions.id, emailOutbox.questionId))
		.innerJoin(
			pushOutbox,
			and(
				eq(pushOutbox.userId, userId),
				eq(
					pushOutbox.collapseKey,
					sql`case when ${questions.gameId} is null then 'call:' || ${emailOutbox.callId} else 'game:' || ${questions.gameId} end`,
				),
				gte(pushOutbox.sentAt, emailOutbox.createdAt),
				sql`(${pushOutbox.skippedReason} is null or ${pushOutbox.skippedReason} = 'unchanged')`,
			),
		)
		.where(rowsIn(rows))
	const told = new Map<string, AlreadyTold>()
	for (const { id } of pushed) told.set(id, "pushed")
	for (const { id } of seen) told.set(id, "seen_in_app")
	return told
}

// The most recent 13:00 UTC at or before `now`.
function digestDayStart(now: Date): Date {
	const dayStart = new Date(now)
	dayStart.setUTCHours(DAY_START_HOUR_UTC, 0, 0, 0)
	if (dayStart > now) dayStart.setUTCDate(dayStart.getUTCDate() - 1)
	return dayStart
}

type DigestAchievementEntry = {
	// Every notice the line stands for, all marked emailed once it sends.
	dedupeKeys: string[]
	achievement: DigestAchievement
}

// The user's sweep and streak events not yet in any email, each as its line
// and a link to the page that shows it off. A streak run gets one line: a
// snap stands for the whole run, otherwise its longest milestone or best
// does, so the email never says "5 in a row" next to "ended at 5".
async function loadDigestAchievements(
	userId: string,
	username: string,
	now: Date,
): Promise<DigestAchievementEntry[]> {
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

	const events = rows.flatMap(({ dedupeKey, notification: n }) => {
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
		const count = n.achievementCount ?? 0
		return [
			{
				dedupeKey,
				run: noticeRun(dedupeKey),
				kind,
				count,
				achievement: {
					text: achievementText({
						kind,
						label: n.achievementLabel ?? "",
						count,
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

	const entries: DigestAchievementEntry[] = []
	const runLines = new Map<
		string,
		{ entry: DigestAchievementEntry; kind: AchievementKind; count: number }
	>()
	for (const event of events) {
		if (!event.run) {
			entries.push({
				dedupeKeys: [event.dedupeKey],
				achievement: event.achievement,
			})
			continue
		}
		const line = runLines.get(event.run)
		if (!line) {
			const entry = {
				dedupeKeys: [event.dedupeKey],
				achievement: event.achievement,
			}
			runLines.set(event.run, { entry, kind: event.kind, count: event.count })
			entries.push(entry)
			continue
		}
		line.entry.dedupeKeys.push(event.dedupeKey)
		const replaces =
			line.kind !== "streak_snapped" &&
			(event.kind === "streak_snapped" || event.count > line.count)
		if (replaces) {
			line.entry.achievement = event.achievement
			line.kind = event.kind
			line.count = event.count
		}
	}
	return entries
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
	const dayStart = digestDayStart(now)
	const dayStartUtc = utcTimestamp(dayStart)
	const due = await db.execute<{ user_id: string; day_done: boolean }>(sql`
		with pending as (
			select user_id, min(created_at) as oldest
			from email_outbox
			where sent_at is null
				and attempts < ${OUTBOX.maxAttempts}
			group by user_id
		),
		ready as (
			select
				p.user_id,
				p.oldest,
				(
					-- Today's email hasn't gone out. The morning send only ever
					-- carries rows from before the day began, so a sent row from
					-- after it means today's is spent.
					not exists (
						select 1
						from email_outbox s
						where s.user_id = p.user_id
							and s.sent_at is not null
							and s.skipped_reason is null
							and s.created_at >= ${dayStartUtc}
					)
					-- None of their calls on today's games still unsettled. A
					-- question settled mid-game counts until its game's final
					-- read announces it, since that's when its row is queued.
					-- Disputed and voided questions don't hold anything up.
					and not exists (
						select 1
						from calls c
						join questions q on q.id = c.question_id
						join games g on g.id = q.game_id
						left join question_auto_resolutions a on a.question_id = q.id
						where c.user_id = p.user_id
							and (q.status in ('open', 'locked') or a.awaiting_final)
							and g.starts_at >= ${dayStartUtc}
							and g.starts_at < ${dayStartUtc} + interval '1 day'
					)
					-- No game today still to finish in a league they called,
					-- whether or not they've called it yet, so a 1pm result
					-- waits for the 7pm game they might call later.
					and not exists (
						select 1
						from games g
						where g.status <> 'final'
							and g.starts_at >= ${dayStartUtc}
							and g.starts_at < ${dayStartUtc} + interval '1 day'
							and g.league_id in (
								select cg.league_id
								from calls c
								join questions q on q.id = c.question_id
								join games cg on cg.id = q.game_id
								where c.user_id = p.user_id
									and cg.starts_at >= ${dayStartUtc}
									and cg.starts_at < ${dayStartUtc} + interval '1 day'
							)
					)
				) as day_done
			from pending p
			where p.oldest <= ${nowUtc} - ${`${SETTLE_MINUTES} minutes`}::interval
		)
		select user_id, day_done
		from ready
		-- Done for the day, or waiting since before today began: the morning
		-- send.
		where day_done or oldest < ${dayStartUtc}
		limit ${MAX_USERS_PER_RUN}
	`)

	let sent = 0
	let skipped = 0

	for (const { user_id: userId, day_done: dayDone } of due.rows) {
		// The morning send takes only what's left from before today, so it
		// doesn't spend today's email on a result from the first few minutes.
		const claimBefore = dayDone ? null : dayStart
		const result = await drainOneUser(userId, send, now, claimBefore)
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
	claimBefore: Date | null,
): Promise<{ sent: number; skipped: number }> {
	const claimed = await claimOutboxRows(OUTBOX, {
		where: and(
			eq(emailOutbox.userId, userId),
			claimBefore ? lt(emailOutbox.createdAt, claimBefore) : undefined,
		),
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

	const alreadyTold = await loadAlreadyTold(userId, claimed)
	for (const reason of ["seen_in_app", "pushed"] as const) {
		const ids = [...alreadyTold].flatMap(([id, how]) =>
			how === reason ? [id] : [],
		)
		if (ids.length === 0) continue
		await markOutboxDone(emailOutbox, inArray(emailOutbox.id, ids), {
			now,
			skippedReason: reason,
		})
	}
	const unseen = claimed.filter((r) => !alreadyTold.has(r.id))
	if (unseen.length === 0) return { sent: 0, skipped: alreadyTold.size }

	// Re-checks that each question is still `resolved`. A dispute filed inside
	// the settling window flips it to `disputed`, at which point the result is
	// contested and mailing "you called it" about it would be wrong.
	// loadResolvedCallSummaries applies that gate, so anything it drops is
	// exactly what shouldn't be described. Note the call PAGE stays reachable
	// for those - it just shows no outcome; it's the email's claim about an
	// outcome that has to be withheld.
	const summaries = await loadResolvedCallSummaries(
		unseen.map((r) => r.callId),
	)
	const stale = unseen.filter((r) => !summaries.has(r.callId))
	if (stale.length > 0) {
		await markOutboxDone(emailOutbox, rowsIn(stale), {
			now,
			skippedReason: "no_longer_resolved",
		})
	}
	const skipped = alreadyTold.size + stale.length
	const live = unseen.filter((r) => summaries.has(r.callId))
	if (live.length === 0) return { sent: 0, skipped }

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
	// the biggest miss. A loss card is still worth sharing here - owning a
	// miss is half of what a public record is for.
	// `ordered` is non-empty (live.length > 0 and every live row has a
	// summary); the guard is for the type, not a reachable case.
	const primary = ordered.find((s) => s.isWin) ?? ordered[0]
	if (!primary) return { sent: 0, skipped }

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
		return { sent: 0, skipped }
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
						achievements.flatMap((a) => a.dedupeKeys),
					),
				),
			)
	}
	return { sent: live.length, skipped }
}
