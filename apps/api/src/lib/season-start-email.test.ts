import { eq, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import {
	ballots,
	emailOptOuts,
	leagues,
	seasonStartEmails,
	users,
} from "../db/schema"
import { env } from "../env"
import {
	futureDate,
	makeGame,
	makeLeague,
	makeSeason,
	makeUser,
} from "../test/factories"
import { mailRecorder } from "../test/helpers"
import {
	announceableSeasons,
	drainSeasonStartEmails,
	enqueueSeasonStartEmails,
} from "./season-start-email"

import { DAY_MS } from "./time"

/**
 * A league whose season opens `daysOut` from now with one scheduled game -
 * the minimum shape announceableSeasons will accept.
 */
async function seedUpcomingSeason({
	daysOut = 3,
	windowType = "week" as "date" | "week",
	games = 1,
	slug,
	// How far ESPN's season boundary sits before the first game. Defaults to
	// the shape real data has: NFL 2026's boundary is the Sunday, its first
	// game the Wednesday after. Nothing should read the boundary.
	boundaryDaysBefore = 3,
}: {
	daysOut?: number
	windowType?: "date" | "week"
	games?: number
	slug?: string
	boundaryDaysBefore?: number
} = {}) {
	const league = await makeLeague({
		windowType,
		...(slug ? { slug, name: slug.toUpperCase() } : {}),
	})
	const firstGameAt = new Date(Date.now() + daysOut * DAY_MS)
	const season = await makeSeason({
		leagueId: league.id,
		regularSeasonStartsAt: new Date(
			firstGameAt.getTime() - boundaryDaysBefore * DAY_MS,
		),
		regularSeasonEndsAt: new Date(firstGameAt.getTime() + 120 * DAY_MS),
	})
	for (let i = 0; i < games; i++) {
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			startsAt: new Date(firstGameAt.getTime() + i * 60_000),
			seasonType: "regular",
			...(windowType === "week" ? { weekNumber: 1 } : {}),
		})
	}
	return { league, season, firstGameAt }
}

async function pendingCount(): Promise<number> {
	const { rows } = await db.execute<{ count: number }>(
		sql`select count(*)::int as count from season_start_emails where sent_at is null`,
	)
	return rows[0]?.count ?? 0
}

describe("announceableSeasons", () => {
	it("takes seasons inside the lead window and leaves the rest", async () => {
		const { league: soon } = await seedUpcomingSeason({ daysOut: 3 })
		// Past the window - real, synced, and simply not close enough yet. The
		// daily rerun will pick it up when it is.
		await seedUpcomingSeason({ daysOut: 30 })
		// Well underway. Not news, and the copy would be wrong.
		const started = await makeLeague()
		const startedSeason = await makeSeason({
			leagueId: started.id,
			regularSeasonStartsAt: new Date(Date.now() - 5 * DAY_MS),
		})
		await makeGame({
			leagueId: started.id,
			seasonId: startedSeason.id,
			seasonType: "regular",
			weekNumber: 1,
			startsAt: new Date(Date.now() - 5 * DAY_MS),
		})

		const found = await announceableSeasons()
		expect(found.map((s) => s.leagueName)).toEqual([soon.name])
	})

	// The shape that broke this in production. ESPN's regular-season boundary
	// for NFL 2026 was Sunday Sep 6 while the first week 1 game was Wednesday
	// Sep 10, so keying on the boundary rejected a season that was still three
	// days from kickoff - and would have dated the email off it and told the
	// list the season started "today".
	it("keys on the first game, not ESPN's already-passed season boundary", async () => {
		const league = await makeLeague({ windowType: "week" })
		const firstGameAt = new Date(Date.now() + 3 * DAY_MS)
		const season = await makeSeason({
			leagueId: league.id,
			// Two days in the PAST, like the real one was.
			regularSeasonStartsAt: new Date(Date.now() - 2 * DAY_MS),
		})
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			seasonType: "regular",
			weekNumber: 1,
			startsAt: firstGameAt,
		})

		const [found] = await announceableSeasons()
		expect(found?.seasonId).toBe(season.id)
		expect(found?.startsAt.toISOString()).toBe(firstGameAt.toISOString())
	})

	// The mirror of the above: the boundary is still ahead, but the games have
	// all been played, so there is nothing to announce.
	it("drops a season whose opener has already kicked off", async () => {
		const league = await makeLeague({ windowType: "week" })
		const season = await makeSeason({
			leagueId: league.id,
			regularSeasonStartsAt: new Date(Date.now() + 2 * DAY_MS),
		})
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			seasonType: "regular",
			weekNumber: 1,
			startsAt: new Date(Date.now() - 60 * 60 * 1000),
		})

		expect(await announceableSeasons()).toEqual([])
	})

	it("skips a league that isn't active", async () => {
		const league = await makeLeague({ status: "inactive", windowType: "week" })
		const season = await makeSeason({
			leagueId: league.id,
			regularSeasonStartsAt: new Date(Date.now() + 3 * DAY_MS),
		})
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			seasonType: "regular",
			weekNumber: 1,
		})

		expect(await announceableSeasons()).toEqual([])
	})

	// Nothing synced means the email would send people to an empty tab. The
	// lead window gives the sync several more days to land before the season
	// starts, so skipping today costs nothing.
	it("skips a season with no games and no ballots", async () => {
		const league = await makeLeague()
		await makeSeason({
			leagueId: league.id,
			regularSeasonStartsAt: new Date(Date.now() + 3 * DAY_MS),
		})

		expect(await announceableSeasons()).toEqual([])
	})

	it("announces a season that has ballots but no schedule yet", async () => {
		const league = await makeLeague()
		const season = await makeSeason({
			leagueId: league.id,
			regularSeasonStartsAt: new Date(Date.now() + 3 * DAY_MS),
		})
		await db.insert(ballots).values({
			name: "MVP",
			slug: `mvp-${season.id}`,
			sportId: league.sportId,
			leagueId: league.id,
			seasonId: season.id,
			status: "published",
		})

		const [found] = await announceableSeasons()
		expect(found).toMatchObject({ gameCount: 0, ballotCount: 1 })
	})

	// The first slate is counted in the league's own unit, so the number in
	// the email reads as an opening rather than as "every game this week".
	it("counts the first week for a week league and the first day for a date league", async () => {
		const { league: weekly, season: weeklySeason } = await seedUpcomingSeason({
			windowType: "week",
			games: 2,
			slug: "wk",
		})
		// A week 2 game, which the Week 1 count must not include.
		await makeGame({
			leagueId: weekly.id,
			seasonId: weeklySeason.id,
			seasonType: "regular",
			weekNumber: 2,
			startsAt: futureDate(24 * 12),
		})

		const {
			league: daily,
			season: dailySeason,
			firstGameAt: dailyFirstGame,
		} = await seedUpcomingSeason({
			windowType: "date",
			games: 3,
			slug: "dy",
		})
		// The day after opening day - same reasoning as week 2 above. Measured
		// from the first game, not the season boundary, which sits days earlier.
		await makeGame({
			leagueId: daily.id,
			seasonId: dailySeason.id,
			seasonType: "regular",
			startsAt: new Date(dailyFirstGame.getTime() + 2 * DAY_MS),
		})

		const found = await announceableSeasons()
		expect(
			found.map((s) => ({
				label: s.openingLabel,
				games: s.gameCount,
			})),
		).toEqual(
			expect.arrayContaining([
				{ label: "Week 1", games: 2 },
				{ label: "opening day", games: 3 },
			]),
		)
	})
})

describe("enqueueSeasonStartEmails", () => {
	it("queues nothing without commit", async () => {
		await seedUpcomingSeason()
		await makeUser()

		const result = await enqueueSeasonStartEmails()
		expect(result.seasons).toHaveLength(1)
		expect(await pendingCount()).toBe(0)
	})

	it("queues one row per user and reruns as a no-op", async () => {
		await seedUpcomingSeason()
		await makeUser()
		await makeUser()

		expect((await enqueueSeasonStartEmails({ commit: true })).queued).toBe(2)
		// The daily rerun inside the lead window - the unique constraint is what
		// makes it free rather than a second email each.
		expect((await enqueueSeasonStartEmails({ commit: true })).queued).toBe(0)
		expect(await pendingCount()).toBe(2)
	})

	it("leaves out people who muted this email or all email", async () => {
		await seedUpcomingSeason()
		const wanted = await makeUser()
		const mutedType = await makeUser()
		const mutedAll = await makeUser()
		await db.insert(emailOptOuts).values([
			{ userId: mutedType.id, type: "season_starting" },
			{ userId: mutedAll.id, type: "all" },
		])

		await enqueueSeasonStartEmails({ commit: true })
		const rows = await db.query.seasonStartEmails.findMany()
		expect(rows.map((r) => r.userId)).toEqual([wanted.id])
	})

	// A broadcast is exactly the send shape where a pile of hard bounces
	// becomes a domain reputation problem, so unlike the resolution digest
	// this one won't even queue a known-dead address.
	it("leaves out addresses that have already hard-bounced", async () => {
		await seedUpcomingSeason()
		const good = await makeUser()
		await makeUser({ emailBouncedAt: new Date() })

		await enqueueSeasonStartEmails({ commit: true })
		const rows = await db.query.seasonStartEmails.findMany()
		expect(rows.map((r) => r.userId)).toEqual([good.id])
	})

	it("queues only the named account when smoke-testing", async () => {
		await seedUpcomingSeason()
		const me = await makeUser({ email: "me@example.com" })
		await makeUser()

		await enqueueSeasonStartEmails({ commit: true, onlyUser: "me@example.com" })
		const rows = await db.query.seasonStartEmails.findMany()
		expect(rows.map((r) => r.userId)).toEqual([me.id])
	})
})

describe("drainSeasonStartEmails", () => {
	it("sends one email per queued row and doesn't send it twice", async () => {
		await seedUpcomingSeason({ slug: "nfl" })
		await makeUser({ email: "caller@example.com" })
		await enqueueSeasonStartEmails({ commit: true })

		const first = mailRecorder()
		expect(await drainSeasonStartEmails({ send: first.send })).toMatchObject({
			sent: 1,
		})
		expect(first.sent[0]?.to).toBe("caller@example.com")
		// Not results@, which is the digest's sender - see
		// EMAIL_FROM_ANNOUNCEMENTS in env.ts.
		expect(first.sent[0]?.from).toBe(env.EMAIL_FROM_ANNOUNCEMENTS)
		// The whole subject, not just the prefix. The date in it comes back from
		// raw SQL as a Postgres timestamp string, and handing that straight to
		// luxon (rather than through parsePgTimestamp) yields a perfectly
		// well-formed "NFL is back Invalid DateTime." that every unit test here
		// misses, because those build real Dates by hand.
		expect(first.sent[0]?.subject).toMatch(
			/^NFL is back (today|tomorrow|\w+day|\w+day, \w{3} \d{1,2})\.$/,
		)
		expect(first.sent[0]?.text).toContain("utm_campaign=season_start")
		expect(first.sent[0]?.headers?.["List-Unsubscribe"]).toBeDefined()

		// Nothing left pending, so a second tick five minutes later is a no-op.
		const second = mailRecorder()
		expect(await drainSeasonStartEmails({ send: second.send })).toMatchObject({
			sent: 0,
		})
		expect(second.sent).toHaveLength(0)
	})

	// Checked at send time as well as at enqueue, so unsubscribing between the
	// two still counts - the enqueue can be up to a day ahead of the send.
	it("skips someone who unsubscribed after being queued", async () => {
		await seedUpcomingSeason()
		const user = await makeUser()
		await enqueueSeasonStartEmails({ commit: true })
		await db.insert(emailOptOuts).values({ userId: user.id, type: "all" })

		const mail = mailRecorder()
		expect(await drainSeasonStartEmails({ send: mail.send })).toMatchObject({
			sent: 0,
			skipped: 1,
		})
		expect(mail.sent).toHaveLength(0)
		const [row] = await db.query.seasonStartEmails.findMany()
		expect(row?.skippedReason).toBe("muted")
	})

	// The copy is written for "starts today" at the latest. A row still queued
	// well after kickoff describes a season that is already underway, so it is
	// retired rather than sent.
	it("skips a row whose opener kicked off before the drain ran", async () => {
		const { season } = await seedUpcomingSeason({ daysOut: 3 })
		await makeUser()
		await enqueueSeasonStartEmails({ commit: true })
		// The games move, not the season boundary - the games are what the
		// announcement is dated from.
		await db.execute(sql`
			update games set starts_at = now() - interval '2 hours'
			where season_id = ${season.id}
		`)

		const mail = mailRecorder()
		expect(await drainSeasonStartEmails({ send: mail.send })).toMatchObject({
			sent: 0,
			skipped: 1,
		})
		const [row] = await db.query.seasonStartEmails.findMany()
		expect(row?.skippedReason).toBe("season_no_longer_announceable")
	})

	// Everything the enqueue checked is re-checked at send time, because up to
	// a day passes in between - a league pulled from the site in that window
	// shouldn't still announce its season.
	it("skips a row whose league went inactive after it was queued", async () => {
		const { league } = await seedUpcomingSeason()
		await makeUser()
		await enqueueSeasonStartEmails({ commit: true })
		await db
			.update(leagues)
			.set({ status: "inactive" })
			.where(eq(leagues.id, league.id))

		const mail = mailRecorder()
		expect(await drainSeasonStartEmails({ send: mail.send })).toMatchObject({
			sent: 0,
			skipped: 1,
		})
		const [row] = await db.query.seasonStartEmails.findMany()
		expect(row?.skippedReason).toBe("season_no_longer_announceable")
	})

	// A failed send leaves the row unsent so the next tick retries it, but the
	// claim has already spent an attempt - which is what stops a bad address
	// from being retried forever.
	it("retries a failed send and records the error", async () => {
		await seedUpcomingSeason()
		await makeUser()
		await enqueueSeasonStartEmails({ commit: true })

		const failing = mailRecorder({ ok: false, error: "resend exploded" })
		expect(await drainSeasonStartEmails({ send: failing.send })).toMatchObject({
			sent: 0,
			failed: 1,
		})
		const [row] = await db.query.seasonStartEmails.findMany()
		expect(row).toMatchObject({
			sentAt: null,
			attempts: 1,
			lastError: "resend exploded",
		})

		const retry = mailRecorder()
		expect(await drainSeasonStartEmails({ send: retry.send })).toMatchObject({
			sent: 1,
		})
	})

	it("spreads a list bigger than one batch across ticks", async () => {
		await seedUpcomingSeason()
		await makeUser()
		await makeUser()
		await makeUser()
		await enqueueSeasonStartEmails({ commit: true })

		const mail = mailRecorder()
		expect(
			await drainSeasonStartEmails({ send: mail.send, limit: 2 }),
		).toMatchObject({ sent: 2 })
		expect(
			await drainSeasonStartEmails({ send: mail.send, limit: 2 }),
		).toMatchObject({ sent: 1 })
		expect(new Set(mail.sent.map((m) => m.to)).size).toBe(3)
	})

	it("mails a user once per league when two seasons open at once", async () => {
		await seedUpcomingSeason({ slug: "nba", daysOut: 2 })
		await seedUpcomingSeason({ slug: "nhl", daysOut: 4 })
		await makeUser()
		await enqueueSeasonStartEmails({ commit: true })

		const mail = mailRecorder()
		await drainSeasonStartEmails({ send: mail.send })
		expect(mail.sent.map((m) => m.subject).sort()).toEqual([
			expect.stringContaining("NBA is back"),
			expect.stringContaining("NHL is back"),
		])
	})

	it("skips a row whose user was deleted", async () => {
		await seedUpcomingSeason()
		const user = await makeUser()
		await enqueueSeasonStartEmails({ commit: true })
		// The row cascades away with the user, so there is nothing left to
		// drain - the "user_missing" branch exists for a delete that races the
		// claim, not for this.
		await db.delete(users).where(sql`${users.id} = ${user.id}`)

		const mail = mailRecorder()
		expect(await drainSeasonStartEmails({ send: mail.send })).toMatchObject({
			sent: 0,
		})
		expect(await db.query.seasonStartEmails.findMany()).toEqual([])
	})
})

describe("seasonStartEmails rows", () => {
	it("never queues the same person for the same season twice", async () => {
		const { season } = await seedUpcomingSeason()
		const user = await makeUser()
		await db
			.insert(seasonStartEmails)
			.values({ userId: user.id, seasonId: season.id })

		await expect(
			db
				.insert(seasonStartEmails)
				.values({ userId: user.id, seasonId: season.id }),
		).rejects.toThrow()
	})
})
