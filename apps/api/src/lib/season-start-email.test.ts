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
import {
	futureDate,
	makeGame,
	makeLeague,
	makeSeason,
	makeUser,
} from "../test/factories"
import type { MailMessage, MailResult } from "./mailer"
import {
	announceableSeasons,
	drainSeasonStartEmails,
	enqueueSeasonStartEmails,
} from "./season-start-email"

const DAY = 24 * 60 * 60 * 1000

/** Collects what would have gone out instead of calling Resend. */
function recorder(result: MailResult = { ok: true }) {
	const sent: MailMessage[] = []
	return {
		sent,
		send: async (message: MailMessage) => {
			sent.push(message)
			return result
		},
	}
}

/**
 * A league whose season opens `daysOut` from now with one scheduled game -
 * the minimum shape announceableSeasons will accept.
 */
async function seedUpcomingSeason({
	daysOut = 3,
	windowType = "week" as "date" | "week",
	games = 1,
	slug,
}: {
	daysOut?: number
	windowType?: "date" | "week"
	games?: number
	slug?: string
} = {}) {
	const league = await makeLeague({
		windowType,
		...(slug ? { slug, name: slug.toUpperCase() } : {}),
	})
	const startsAt = new Date(Date.now() + daysOut * DAY)
	const season = await makeSeason({
		leagueId: league.id,
		regularSeasonStartsAt: startsAt,
		regularSeasonEndsAt: new Date(startsAt.getTime() + 120 * DAY),
	})
	for (let i = 0; i < games; i++) {
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			startsAt: new Date(startsAt.getTime() + i * 60_000),
			seasonType: "regular",
			...(windowType === "week" ? { weekNumber: 1 } : {}),
		})
	}
	return { league, season }
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
			regularSeasonStartsAt: new Date(Date.now() - 5 * DAY),
		})
		await makeGame({
			leagueId: started.id,
			seasonId: startedSeason.id,
			seasonType: "regular",
			weekNumber: 1,
		})

		const found = await announceableSeasons()
		expect(found.map((s) => s.leagueName)).toEqual([soon.name])
	})

	// seasons.regularSeasonStartsAt is ESPN's boundary for the season, not its
	// first kickoff (NFL's is 3am Eastern on the Wednesday before a Thursday
	// opener), and the enqueue only runs once a day - so a boundary that falls
	// between two runs must not mean the season is never announced at all.
	it("still announces a season whose start just passed", async () => {
		const league = await makeLeague({ windowType: "week" })
		const season = await makeSeason({
			leagueId: league.id,
			regularSeasonStartsAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
		})
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			seasonType: "regular",
			weekNumber: 1,
		})

		expect((await announceableSeasons()).map((s) => s.seasonId)).toEqual([
			season.id,
		])
	})

	it("skips a league that isn't active", async () => {
		const league = await makeLeague({ status: "inactive", windowType: "week" })
		const season = await makeSeason({
			leagueId: league.id,
			regularSeasonStartsAt: new Date(Date.now() + 3 * DAY),
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
			regularSeasonStartsAt: new Date(Date.now() + 3 * DAY),
		})

		expect(await announceableSeasons()).toEqual([])
	})

	it("announces a season that has ballots but no schedule yet", async () => {
		const league = await makeLeague()
		const season = await makeSeason({
			leagueId: league.id,
			regularSeasonStartsAt: new Date(Date.now() + 3 * DAY),
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

		const { league: daily, season: dailySeason } = await seedUpcomingSeason({
			windowType: "date",
			games: 3,
			slug: "dy",
		})
		// The day after opening day - same reasoning as week 2 above.
		await makeGame({
			leagueId: daily.id,
			seasonId: dailySeason.id,
			seasonType: "regular",
			startsAt: new Date(dailySeason.regularSeasonStartsAt.getTime() + 2 * DAY),
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

		const first = recorder()
		expect(await drainSeasonStartEmails({ send: first.send })).toMatchObject({
			sent: 1,
		})
		expect(first.sent[0]?.to).toBe("caller@example.com")
		expect(first.sent[0]?.subject).toContain("NFL is back")
		expect(first.sent[0]?.text).toContain("utm_campaign=season_start")
		expect(first.sent[0]?.headers?.["List-Unsubscribe"]).toBeDefined()

		// Nothing left pending, so a second tick five minutes later is a no-op.
		const second = recorder()
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

		const mail = recorder()
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
	it("skips a row whose season has already started", async () => {
		const { season } = await seedUpcomingSeason({ daysOut: 3 })
		await makeUser()
		await enqueueSeasonStartEmails({ commit: true })
		await db.execute(sql`
			update seasons set regular_season_starts_at = now() - interval '5 days'
			where id = ${season.id}
		`)

		const mail = recorder()
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

		const mail = recorder()
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

		const failing = recorder({ ok: false, error: "resend exploded" })
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

		const retry = recorder()
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

		const mail = recorder()
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

		const mail = recorder()
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

		const mail = recorder()
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
