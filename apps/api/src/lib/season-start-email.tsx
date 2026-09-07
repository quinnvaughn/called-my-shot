import { and, eq, sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../db"
import { seasonStartEmails } from "../db/schema"
import { renderEmail } from "../emails/render"
import {
	heroTarget,
	SeasonStart,
	seasonStartSubject,
} from "../emails/season-start"
import { env } from "../env"
import { emailUrl, withUtm } from "./email-links"
import { isMuted, mutedEmailTypesByUser } from "./email-prefs"
import { oneClickUnsubscribeUrl, unsubscribePageUrl } from "./email-unsubscribe"
import { sendMail } from "./mailer"

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
const MAX_ATTEMPTS = 5

// How far PAST a season's nominal start it can still be announced. The copy
// is written for "starts today" at the latest, so anything older is announced
// wrong rather than late.
//
// One day rather than zero because seasons.regularSeasonStartsAt is ESPN's
// own boundary for the season, not its first kickoff - NFL's is 3am Eastern
// on the Wednesday before a Thursday opener - and because the enqueue only
// runs once a day. Without the grace, a season whose boundary falls between
// two enqueue runs is never announced at all, which is the one failure mode
// this job has no way to notice or recover from. Applied at BOTH ends (the
// enqueue's window and the drain's re-check) so the two can't disagree about
// whether a season is still worth mailing about.
const STALE_AFTER_DAYS = 1

type SendFn = typeof sendMail

// Everything the email says about a season, resolved once per season per
// drain rather than per recipient - the counts are the same for all of them.
export type SeasonAnnouncement = {
	seasonId: string
	leagueName: string
	leagueSlug: string
	seasonDisplayName: string
	regularSeasonStartsAt: Date
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
	regular_season_starts_at: Date
}

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
				select count(*)::int as game_count
				from games
				where season_id = ${seasonId}
					and season_type = 'regular'
				group by (starts_at at time zone 'America/New_York')::date
				order by (starts_at at time zone 'America/New_York')::date asc
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
		regularSeasonStartsAt: row.regular_season_starts_at,
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
}: {
	leadDays?: number
	leagueSlug?: string
} = {}): Promise<SeasonAnnouncement[]> {
	const { rows } = await db.execute<SeasonRow>(sql`
		select
			s.id as season_id,
			l.name as league_name,
			l.slug as league_slug,
			l.window_type,
			s.display_name,
			s.regular_season_starts_at
		from seasons s
		join leagues l on l.id = s.league_id
		where l.status = 'active'
			and s.regular_season_starts_at > now() - ${`${STALE_AFTER_DAYS} days`}::interval
			and s.regular_season_starts_at <= now() + ${`${leadDays} days`}::interval
			${leagueSlug ? sql`and l.slug = ${leagueSlug}` : sql``}
		order by s.regular_season_starts_at asc
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
}: {
	leadDays?: number
	leagueSlug?: string
	// A username or email, to queue one account for a smoke test rather than
	// the whole list.
	onlyUser?: string
	commit?: boolean
} = {}): Promise<EnqueueResult> {
	const seasons = await announceableSeasons({ leadDays, leagueSlug })
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

	console.log(
		`[season-start] enqueued ${queued} row(s) across ${seasons.length} season(s): ${seasons
			.map((s) => `${s.leagueName} ${s.seasonDisplayName}`)
			.join(", ")}`,
	)
	return { seasons, queued }
}

async function markSkipped(
	rows: { user_id: string; season_id: string }[],
	reason: string,
): Promise<void> {
	if (rows.length === 0) return
	await db.execute(sql`
		update season_start_emails
		set sent_at = now(), skipped_reason = ${reason}
		where (user_id, season_id) in (
			${sql.join(
				rows.map((r) => sql`(${r.user_id}::uuid, ${r.season_id}::uuid)`),
				sql`, `,
			)}
		)
	`)
}

type Claimed = { user_id: string; season_id: string }

// Spends the attempt in the same statement that reads the rows, so a run that
// dies between here and the send has still burned one - a row that kills the
// process can't be retried forever.
//
// It is NOT mutual exclusion, despite looking like a claim: this UPDATE
// commits immediately and releases its row locks while the rows are still
// `sent_at is null`, so a second concurrent drain selects them again. What
// keeps two machines from mailing the same person is the job lock every
// caller takes - see DRAIN_SEASON_START_LOCK in lib/advisory-lock.ts.
async function claimBatch(limit: number): Promise<Claimed[]> {
	const { rows } = await db.execute<Claimed>(sql`
		update season_start_emails
		set attempts = attempts + 1
		where (user_id, season_id) in (
			select user_id, season_id
			from season_start_emails
			where sent_at is null and attempts < ${MAX_ATTEMPTS}
			order by created_at asc
			limit ${limit}
			for update skip locked
		)
		returning user_id, season_id
	`)
	return rows
}

// MUST be called under DRAIN_SEASON_START_LOCK (lib/advisory-lock.ts) -
// nothing in here is safe against a second concurrent drain, and this one
// mails the whole list rather than one person, so a race duplicates a
// broadcast. Both callers, the scheduler and the CLI script, take it by name.
export async function drainSeasonStartEmails({
	send = sendMail,
	limit = MAX_EMAILS_PER_RUN,
}: {
	send?: SendFn
	limit?: number
} = {}): Promise<{
	sent: number
	skipped: number
	failed: number
}> {
	const claimed = await claimBatch(limit)
	if (claimed.length === 0) return { sent: 0, skipped: 0, failed: 0 }

	const seasonIds = [...new Set(claimed.map((r) => r.season_id))]
	const userIds = [...new Set(claimed.map((r) => r.user_id))]

	// Every season still worth announcing, keyed by id - re-asking every
	// question the enqueue asked, because up to a day passes between the two
	// and the answers can change inside it. A season that has since started,
	// been deleted, had its league deactivated, or lost the games it was going
	// to be announced for drops out here, and every row pointing at it is
	// skipped rather than described wrongly.
	const announcements = new Map<string, SeasonAnnouncement>()
	const { rows: seasonRows } = await db.execute<SeasonRow>(sql`
		select
			s.id as season_id,
			l.name as league_name,
			l.slug as league_slug,
			l.window_type,
			s.display_name,
			s.regular_season_starts_at
		from seasons s
		join leagues l on l.id = s.league_id
		where s.id in (${sql.join(
			seasonIds.map((id) => sql`${id}::uuid`),
			sql`, `,
		)})
			and l.status = 'active'
			and s.regular_season_starts_at > now() - ${`${STALE_AFTER_DAYS} days`}::interval
	`)
	for (const row of seasonRows) {
		const announcement = await describeSeason(row)
		if (announcement.gameCount === 0 && announcement.ballotCount === 0) continue
		announcements.set(row.season_id, announcement)
	}

	const users = await db.query.users.findMany({
		where: { id: { in: userIds } },
		columns: { id: true, email: true },
	})
	const emailByUser = new Map(users.map((u) => [u.id, u.email]))
	const mutedByUser = await mutedEmailTypesByUser(userIds)

	const stale = claimed.filter((r) => !announcements.has(r.season_id))
	await markSkipped(stale, "season_no_longer_announceable")

	const missing = claimed.filter(
		(r) => announcements.has(r.season_id) && !emailByUser.has(r.user_id),
	)
	await markSkipped(missing, "user_missing")

	const muted = claimed.filter(
		(r) =>
			announcements.has(r.season_id) &&
			emailByUser.has(r.user_id) &&
			isMuted(mutedByUser.get(r.user_id), "season_starting"),
	)
	await markSkipped(muted, "muted")

	const skippedKeys = new Set(
		[...stale, ...missing, ...muted].map((r) => `${r.user_id}:${r.season_id}`),
	)
	const sendable = claimed.filter(
		(r) => !skippedKeys.has(`${r.user_id}:${r.season_id}`),
	)

	let sent = 0
	let failed = 0
	for (const row of sendable) {
		const announcement = announcements.get(row.season_id)
		const email = emailByUser.get(row.user_id)
		// Both are guaranteed present by the filters above; the guard is for
		// the types, not a reachable case.
		if (!announcement || !email) continue

		const ok = await sendOne(announcement, row.user_id, email, send)
		if (ok) {
			sent += 1
			await db
				.update(seasonStartEmails)
				.set({ sentAt: new Date() })
				.where(
					and(
						eq(seasonStartEmails.userId, row.user_id),
						eq(seasonStartEmails.seasonId, row.season_id),
					),
				)
		} else {
			failed += 1
		}
	}

	console.log(
		`[season-start] claimed=${claimed.length} sent=${sent} skipped=${skippedKeys.size} failed=${failed}`,
	)
	return { sent, skipped: skippedKeys.size, failed }
}

async function sendOne(
	announcement: SeasonAnnouncement,
	userId: string,
	to: string,
	send: SendFn,
): Promise<boolean> {
	const tag = { campaign: "season_start" } as const
	const leaguePath = `/leagues/${announcement.leagueSlug}`
	const gamesUrl = emailUrl(`${leaguePath}/games`, {
		...tag,
		content: "games_row",
	})
	const seasonUrl = emailUrl(`${leaguePath}/season`, {
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
			emailUrl(`${leaguePath}/season`, { ...tag, content: "hero_season" }),
		)
		.exhaustive()

	const props = {
		leagueName: announcement.leagueName,
		seasonDisplayName: announcement.seasonDisplayName,
		regularSeasonStartsAt: announcement.regularSeasonStartsAt,
		now: new Date(),
		openingLabel: announcement.openingLabel,
		gameCount: announcement.gameCount,
		ballotCount: announcement.ballotCount,
		gamesUrl,
		seasonUrl,
		heroUrl,
		manageUrl: emailUrl("/settings", { ...tag, content: "manage" }),
		unsubscribeUrl: withUtm(unsubscribePageUrl(userId, "season_starting"), {
			...tag,
			content: "unsubscribe",
		}),
		logoUrl: `${env.CLIENT_ORIGIN}/email-logo.png`,
	}

	const { html, text } = await renderEmail(<SeasonStart {...props} />)

	const result = await send({
		to,
		from: env.EMAIL_FROM_NOTIFICATIONS,
		subject: seasonStartSubject(props),
		text,
		html,
		headers: {
			"List-Unsubscribe": `<${oneClickUnsubscribeUrl(userId, "season_starting")}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		},
		tags: [
			{ name: "type", value: "season_start" },
			{ name: "league", value: announcement.leagueSlug },
		],
	})

	if (result.ok) return true
	// attempts was already incremented by the claim, so a row that keeps
	// failing runs itself out of retries without any extra bookkeeping here.
	await db
		.update(seasonStartEmails)
		.set({ lastError: result.error })
		.where(
			and(
				eq(seasonStartEmails.userId, userId),
				eq(seasonStartEmails.seasonId, announcement.seasonId),
			),
		)
	return false
}
