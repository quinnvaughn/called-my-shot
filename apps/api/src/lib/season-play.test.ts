import { describe, expect, it } from "vitest"
import {
	makeCall,
	makeGame,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeUser,
} from "../test/factories"
import { loadSeasonPlay } from "./season-play"

// Recap weeks run Tuesday to Tuesday in New York time. 2026-01-06 is a
// Tuesday, so the weeks here start Jan 6, 13, 20 and 27.
const at = (iso: string) => new Date(iso)

async function seedSeason() {
	const league = await makeLeague()
	const season = await makeSeason({
		leagueId: league.id,
		regularSeasonStartsAt: at("2026-01-06T05:00:00Z"),
		regularSeasonEndsAt: at("2026-04-01T05:00:00Z"),
	})
	// Games in the weeks of Jan 6, 20 and 27; none the week of Jan 13.
	const weekOne = await makeGame({
		leagueId: league.id,
		seasonId: season.id,
		startsAt: at("2026-01-08T00:00:00Z"),
	})
	const weekThree = await makeGame({
		leagueId: league.id,
		seasonId: season.id,
		startsAt: at("2026-01-22T00:00:00Z"),
	})
	const weekFour = await makeGame({
		leagueId: league.id,
		seasonId: season.id,
		startsAt: at("2026-01-28T00:00:00Z"),
	})
	return { league, season, weekOne, weekThree, weekFour }
}

// `count` calls by one user, each on its own question about `gameId` that
// locks at `locksAt`.
async function gameCalls(
	setup: Awaited<ReturnType<typeof seedSeason>>,
	userId: string,
	count: number,
	gameId: string | null,
	locksAt: Date,
) {
	for (let i = 0; i < count; i++) {
		const question = await makeQuestion({
			leagueId: setup.league.id,
			seasonId: setup.season.id,
			gameId,
			locksAt,
		})
		await makeCall(question.id, userId)
	}
}

describe("loadSeasonPlay", () => {
	// Midway through the week of Jan 27.
	const asOf = at("2026-01-29T17:00:00Z")

	it("counts finished weeks with games, and the running week once it's played", async () => {
		const setup = await seedSeason()
		const regular = await makeUser()
		await gameCalls(
			setup,
			regular.id,
			3,
			setup.weekOne.id,
			setup.weekOne.startsAt,
		)
		// Two calls doesn't play a week.
		await gameCalls(
			setup,
			regular.id,
			2,
			setup.weekThree.id,
			setup.weekThree.startsAt,
		)
		await gameCalls(
			setup,
			regular.id,
			3,
			setup.weekFour.id,
			setup.weekFour.startsAt,
		)

		const play = await loadSeasonPlay(setup.season.id, [regular.id], asOf)
		// Weeks of Jan 6 and 20 are over; Jan 27's counts because it's played.
		expect(play.get(regular.id)).toEqual({ weeksPlayed: 2, weeksCounted: 3 })
	})

	it("puts a Monday night game in the week before, and skips season-long calls", async () => {
		const setup = await seedSeason()
		const caller = await makeUser()
		// Monday Jan 12, 8pm in New York: still the week of Jan 6.
		await gameCalls(
			setup,
			caller.id,
			3,
			setup.weekOne.id,
			at("2026-01-13T01:00:00Z"),
		)
		await gameCalls(setup, caller.id, 3, null, setup.weekThree.startsAt)

		const play = await loadSeasonPlay(setup.season.id, [caller.id], asOf)
		expect(play.get(caller.id)).toEqual({ weeksPlayed: 1, weeksCounted: 2 })
	})

	it("reads someone who never played as every finished week skipped", async () => {
		const setup = await seedSeason()
		const absent = await makeUser()

		const play = await loadSeasonPlay(setup.season.id, [absent.id], asOf)
		expect(play.get(absent.id)).toEqual({ weeksPlayed: 0, weeksCounted: 2 })
	})
})
