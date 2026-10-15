import { and, eq, or, type SQL, sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../db"
import { seasonStartEmails } from "../db/schema"
import {
	heroTarget,
	SeasonStart,
	seasonStartSubject,
} from "../emails/season-start"
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
import { markPending } from "./pending-work"
import { parsePgTimestamp } from "./pg-timestamp"
import { ET_ZONE } from "./windows"

// How far ahead of the first game the announcement goes out. A window, not a
// target date: the enqueue asks "does this season start within the next
// LEAD_DAYS", so a league whose opener is three days away when this first
// ships is announced on the very next run rather than having missed its one
// eligible day forever. That's also what makes the job safe to deploy late.
export const LEAD_DAYS = 7

// The drain's per-run ceiling. The enqueue makes one row per user in a single
// pass, so without a cap the first drain after it would try to hand Resend
// the entire list at once; at every-5-minutes this spreads the same list over
// however long it takes, which is what a shared sending domain wants anyway.
const MAX_EMAILS_PER_RUN = 100

const OUTBOX: Outbox<typeof seasonStartEmails> = {
	table: seasonStartEmails,
	key: [seasonStartEmails.userId, seasonStartEmails.seasonId],
	maxAttempts: 5,
}

// What "starts" means here is the first game of the opening slate, NOT
// seasons.regularSeasonStartsAt. That column is ESPN's calendar boundary for
// the season and can sit days before anyone actually plays: NFL 2026's is
// Sunday Sep 6 07:00 UTC while the first week 1 game is Wednesday Sep 10
// 00:20 UTC. Keying on the boundary meant the announcement both missed its
// window and would have told the entire list the season started "today" three
// days before kickoff.
//
// Derived in SQL as min(games.starts_at) over the season's regular-season
// games, which is the opening for both window types - a week league's week 1
// and a date league's opening day both begin at that same first game. Falls
// back to the boundary only when no games are synced at all, which is the
// ballots-only case.
//
// No grace past it: a season is announceable while its first game is still
// ahead, and not after. The lead window below is what makes a missed tick
// survivable, and it no longer has to cover a boundary that passes at 3am.

// Everything the email says about a season, resolved once per season per
// drain rather than per recipient - the counts are the same for all of them.
export type SeasonAnnouncement = {
	seasonId: string
	leagueName: string
	leagueSlug: string
	seasonDisplayName: string
	// First game of the opening slate - see the comment above STALE_AFTER_DAYS'
	// replacement at the top of this file for why this is not the season row's
	// own regularSeasonStartsAt.
	startsAt: Date
	// "Week 1" / "opening day" - see SeasonStartProps.openingLabel.
	openingLabel: string
	gameCount: number
	ballotCount: number
}

type SeasonRow = {
	season_id: string
	league_name: string
	league_slug: string
	window_type: "date" | "week"
	display_name: string
	// A string, not a Date: node-postgres's per-column type parser never runs
	// for a raw db.execute(), so this arrives as Postgres's own text form with
	// no timezone marker. parsePgTimestamp is what turns it into a real UTC
	// Date - see that function for what `new Date(raw)` does instead.
	starts_at: string
}

// Both queries below select the same shape, and both have to agree on how
// starts_at is derived - the enqueue decides who gets mailed and the drain
// re-checks it at send time, so a difference between them would queue rows
// the drain then throws away.
const SEASON_COLUMNS = sql`
	s.id as season_id,
	l.name as league_name,
	l.slug as league_slug,
	l.window_type,
	s.display_name,
	coalesce(
		(
			select min(g.starts_at)
			from games g
			where g.season_id = s.id and g.season_type = 'regular'
		),
		s.regular_season_starts_at
	) as starts_at
`

// The first slate of the regular season, in the league's own unit: a week for
// a week-window league, a calendar day for a date-window one. Not "games in
// the first seven days" for both - that reads as 16 for NFL and as 60-odd for
// MLB, and only one of those is a number anyone recognises as an opening.
async function firstSlate(
	seasonId: string,
	windowType: "date" | "week",
): Promise<{ openingLabel: string; gameCount: number }> {
	return await match(windowType)
		.with("week", async () => {
			const { rows } = await db.execute<{
				week_number: number
				game_count: number
			}>(sql`
				select week_number, count(*)::int as game_count
				from games
				where season_id = ${seasonId}
					and season_type = 'regular'
					and week_number is not null
				group by week_number
				order by week_number asc
				limit 1
			`)
			const first = rows[0]
			return {
				openingLabel: first ? `Week ${first.week_number}` : "Week 1",
				gameCount: first?.game_count ?? 0,
			}
		})
		.with("date", async () => {
			// Grouped on the Eastern calendar date, matching how the email dates
			// kickoff - a 10pm PT first pitch belongs to the opening day people
			// were told about, not to the UTC day after it.
			const { rows } = await db.execute<{ game_count: number }>(sql`
				select
					(starts_at at time zone 'UTC' at time zone ${ET_ZONE})::date as day,
					count(*)::int as game_count
				from games
				where season_id = ${seasonId}
					and season_type = 'regular'
				group by day
				order by day asc
				limit 1
			`)
			return {
				openingLabel: "opening day",
				gameCount: rows[0]?.game_count ?? 0,
			}
		})
		.exhaustive()
}

async function publishedBallotCount(seasonId: string): Promise<number> {
	const { rows } = await db.execute<{ count: number }>(sql`
		select count(*)::int as count
		from ballots
		where season_id = ${seasonId} and status = 'published'
	`)
	return rows[0]?.count ?? 0
}

async function describeSeason(row: SeasonRow): Promise<SeasonAnnouncement> {
	const [slate, ballotCount] = await Promise.all([
		firstSlate(row.season_id, row.window_type),
		publishedBallotCount(row.season_id),
	])
	return {
		seasonId: row.season_id,
		leagueName: row.league_name,
		leagueSlug: row.league_slug,
		seasonDisplayName: row.display_name,
		startsAt: parsePgTimestamp(row.starts_at),
		openingLabel: slate.openingLabel,
		gameCount: slate.gameCount,
		ballotCount,
	}
}

// Seasons close enough to announce and with something to announce. Bounded at
// both ends on purpose: a season well underway is not news, and one past the
// lead window is too far off to act on. `leagueSlug` narrows it to a single
// league for the CLI's dry runs.
export async function announceableSeasons({
	leadDays = LEAD_DAYS,
	leagueSlug,
	now = new Date(),
}: {
	leadDays?: number
	leagueSlug?: string
	now?: Date
} = {}): Promise<SeasonAnnouncement[]> {
	const nowUtc = utcTimestamp(now)
	const { rows } = await db.execute<SeasonRow>(sql`
		with candidate as (
			select ${SEASON_COLUMNS}
			from seasons s
			join leagues l on l.id = s.league_id
			where l.status = 'active'
				${leagueSlug ? sql`and l.slug = ${leagueSlug}` : sql``}
		)
		select * from candidate
		where starts_at > ${nowUtc}
			and starts_at <= ${nowUtc} + ${`${leadDays} days`}::interval
		order by starts_at asc
	`)

	const described = await Promise.all(rows.map(describeSeason))
	// Nothing synced yet means nothing to invite anyone to do. Announcing a
	// season whose schedule hasn't landed sends people to an empty tab, which
	// is a worse outcome than announcing it a day later once the sync catches
	// up - and the lead window gives it several more chances to.
	return described.filter((s) => s.gameCount > 0 || s.ballotCount > 0)
}

export type EnqueueResult = {
	seasons: SeasonAnnouncement[]
	// Rows actually inserted this pass. Reruns inside the lead window insert
	// nothing, which is the point - see the unique constraint's comment in
	// db/schema/email.ts.
	queued: number
}

export async function enqueueSeasonStartEmails({
	leadDays = LEAD_DAYS,
	leagueSlug,
	onlyUser,
	commit = false,
	now = new Date(),
}: {
	leadDays?: number
	leagueSlug?: string
	// A username or email, to queue one account for a smoke test rather than
	// the whole list.
	onlyUser?: string
	commit?: boolean
	now?: Date
} = {}): Promise<EnqueueResult> {
	const seasons = await announceableSeasons({ leadDays, leagueSlug, now })
	if (!commit || seasons.length === 0) return { seasons, queued: 0 }

	let queued = 0
	for (const season of seasons) {
		// Opt-outs are filtered here AND re-checked at send time. Here so the
		// table doesn't fill with rows that exist only to be skipped; there
		// because that's the check that has to be right, and someone can
		// unsubscribe in between. Since the enqueue reruns daily for as long
		// as the season sits in the lead window, un-muting inside it still
		// gets you the email.
		//
		// email_bounced_at is a deliberate divergence from the resolution
		// digest, which leaves bounces entirely to Resend's suppression list.
		// That one mails a handful of people who each just did something; this
		// one mails the whole list at once, which is exactly the shape of send
		// that a pile of hard bounces turns into a domain reputation problem.
		const { rowCount } = await db.execute(sql`
			insert into season_start_emails (user_id, season_id)
			select u.id, ${season.seasonId}
			from users u
			where u.email_bounced_at is null
				${onlyUser ? sql`and (u.username = ${onlyUser} or u.email = ${onlyUser})` : sql``}
				and not exists (
					select 1 from email_opt_outs o
					where o.user_id = u.id and o.type in ('all', 'season_starting')
				)
			on conflict (user_id, season_id) do nothing
		`)
		queued += rowCount ?? 0
	}
	if (queued > 0) markPending("season-start")

	console.log(
		`[season-start] enqueued ${queued} row(s) across ${seasons.length} season(s): ${seasons
			.map((s) => `${s.leagueName} ${s.seasonDisplayName}`)
			.join(", ")}`,
	)
	return { seasons, queued }
}

type Claimed = { userId: string; seasonId: string }

const rowsIn = (rows: Claimed[]) =>
	or(
		...rows.map((row) =>
			and(
				eq(seasonStartEmails.userId, row.userId),
				eq(seasonStartEmails.seasonId, row.seasonId),
			),
		),
	) as SQL

// MUST be called under DRAIN_SEASON_START_LOCK (lib/job-lock.ts) -
// nothing in here is safe against a second concurrent drain, and this one
// mails the whole list rather than one person, so a race duplicates a
// broadcast. Both callers, the scheduler and the CLI script, take it by name.
export async function drainSeasonStartEmails({
	send = sendMail,
	limit = MAX_EMAILS_PER_RUN,
	now = new Date(),
}: {
	send?: SendFn
	limit?: number
	now?: Date
} = {}): Promise<{
	sent: number
	skipped: number
	failed: number
}> {
	const claimed = await claimOutboxRows(OUTBOX, { limit })
	if (claimed.length === 0) return { sent: 0, skipped: 0, failed: 0 }

	const seasonIds = [...new Set(claimed.map((r) => r.seasonId))]
	const userIds = [...new Set(claimed.map((r) => r.userId))]

	// Every season still worth announcing, keyed by id - re-asking every
	// question the enqueue asked, because up to a day passes between the two
	// and the answers can change inside it. A season whose opener has since
	// kicked off,
	// been deleted, had its league deactivated, or lost the games it was going
	// to be announced for drops out here, and every row pointing at it is
	// skipped rather than described wrongly.
	const announcements = new Map<string, SeasonAnnouncement>()
	const { rows: seasonRows } = await db.execute<SeasonRow>(sql`
		with candidate as (
			select ${SEASON_COLUMNS}
			from seasons s
			join leagues l on l.id = s.league_id
			where s.id in (${sql.join(
				seasonIds.map((id) => sql`${id}::uuid`),
				sql`, `,
			)})
				and l.status = 'active'
		)
		select * from candidate where starts_at > ${utcTimestamp(now)}
	`)
	for (const row of seasonRows) {
		const announcement = await describeSeason(row)
		if (announcement.gameCount === 0 && announcement.ballotCount === 0) continue
		announcements.set(row.season_id, announcement)
	}

	const recipients = await loadRecipients(userIds, "season_starting")

	// Each row's reason for not sending, in priority order, or null to send.
	const skipReason = (row: Claimed): string | null => {
		if (!announcements.has(row.seasonId)) return "season_no_longer_announceable"
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
	for (const [reason, rows] of skippedByReason) {
		await markOutboxDone(seasonStartEmails, rowsIn(rows), {
			now,
			skippedReason: reason,
		})
	}
	const skipped = claimed.length - sendable.length

	let sent = 0
	let failed = 0
	for (const row of sendable) {
		const announcement = announcements.get(row.seasonId)
		const recipient = recipients.get(row.userId)
		// Both are guaranteed present by skipReason; the guard is for the
		// types, not a reachable case.
		if (!announcement || !recipient) continue

		// attempts was already incremented by the claim, so a row that keeps
		// failing runs itself out of retries without any extra bookkeeping.
		const result = await sendOne(
			announcement,
			row.userId,
			recipient.email,
			send,
			now,
		)
		if (result.ok) {
			sent += 1
			await markOutboxDone(seasonStartEmails, rowsIn([row]), { now })
		} else {
			failed += 1
			await markOutboxFailed(seasonStartEmails, rowsIn([row]), result.error)
		}
	}

	console.log(
		`[season-start] claimed=${claimed.length} sent=${sent} skipped=${skipped} failed=${failed}`,
	)
	return { sent, skipped, failed }
}

async function sendOne(
	announcement: SeasonAnnouncement,
	userId: string,
	to: string,
	send: SendFn,
	now: Date,
) {
	const tag = { campaign: "season_start" } as const
	const leaguePath = `/leagues/${announcement.leagueSlug}`
	const gamesUrl = emailUrl(`${leaguePath}/games`, {
		...tag,
		content: "games_row",
	})
	const seasonUrl = emailUrl(`${leaguePath}/ballots`, {
		...tag,
		content: "season_row",
	})
	// Built from the same rule the template labels the button with, so the
	// two can't point and read differently - see heroTarget.
	const heroUrl = match(heroTarget(announcement))
		.with("games", () =>
			emailUrl(`${leaguePath}/games`, { ...tag, content: "hero_games" }),
		)
		.with("season", () =>
			emailUrl(`${leaguePath}/ballots`, { ...tag, content: "hero_season" }),
		)
		.exhaustive()

	const props = {
		leagueName: announcement.leagueName,
		seasonDisplayName: announcement.seasonDisplayName,
		startsAt: announcement.startsAt,
		now,
		openingLabel: announcement.openingLabel,
		gameCount: announcement.gameCount,
		ballotCount: announcement.ballotCount,
		gamesUrl,
		seasonUrl,
		heroUrl,
	}

	return sendListEmail(
		{
			userId,
			to,
			type: "season_starting",
			campaign: tag.campaign,
			from: env.EMAIL_FROM_ANNOUNCEMENTS,
			subject: seasonStartSubject(props),
			render: (links) => <SeasonStart {...props} {...links} />,
			extraTags: [{ name: "league", value: announcement.leagueSlug }],
		},
		send,
	)
}
