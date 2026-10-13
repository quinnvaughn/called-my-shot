import { describe, expect, it } from "vitest"
import {
	makeGame,
	makeLeague,
	makeQuestion,
	makeSeason,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"
import { hoursFromNow } from "../../../test/helpers"

const GUEST_PICKS = /* GraphQL */ `
	query GuestPicks($perLeague: Int, $shapes: [QuestionShape!]) {
		guestPickQuestions(perLeague: $perLeague, shapes: $shapes) {
			id
		}
	}
`

type Result = { guestPickQuestions: { id: string }[] }

async function seedGame(
	league: { id: string },
	seasonId: string,
	locksInHours: number,
) {
	const game = await makeGame({ leagueId: league.id, seasonId })
	const inGame = {
		leagueId: league.id,
		seasonId,
		gameId: game.id,
		isOfficial: true,
		locksAt: hoursFromNow(locksInHours),
	}
	const winner = await makeQuestion({ ...inGame, shape: "team_vs_team" })
	const total = await makeQuestion({ ...inGame, shape: "team_stat_over_under" })
	return { game, winner, total }
}

async function guestPickIds(variables: Record<string, unknown>) {
	const data = await expectData<Result>(GUEST_PICKS, { variables })
	return data.guestPickQuestions.map((q) => q.id)
}

describe("guestPickQuestions", () => {
	it("returns every question of each league's soonest games", async () => {
		const league = await makeLeague()
		const season = await makeSeason({ leagueId: league.id })
		const later = await seedGame(league, season.id, 48)
		const sooner = await seedGame(league, season.id, 24)
		const outside = await seedGame(league, season.id, 72)

		const ids = await guestPickIds({ perLeague: 2 })

		// Soonest game first. Order within a game is the web side's to decide.
		expect(ids).toHaveLength(4)
		expect(ids.slice(0, 2).sort()).toEqual(
			[sooner.winner.id, sooner.total.id].sort(),
		)
		expect(ids.slice(2).sort()).toEqual(
			[later.winner.id, later.total.id].sort(),
		)
		expect(ids).not.toContain(outside.winner.id)
	})

	it("leaves out a game whose game-winner isn't callable", async () => {
		const league = await makeLeague()
		const season = await makeSeason({ leagueId: league.id })
		const game = await makeGame({ leagueId: league.id, seasonId: season.id })
		const orphan = await makeQuestion({
			leagueId: league.id,
			seasonId: season.id,
			gameId: game.id,
			isOfficial: true,
			shape: "team_stat_over_under",
			locksAt: hoursFromNow(24),
		})
		const locking = await seedGame(league, season.id, 0.1)

		const ids = await guestPickIds({ perLeague: 3 })

		expect(ids).not.toContain(orphan.id)
		expect(ids).not.toContain(locking.winner.id)
		expect(ids).not.toContain(locking.total.id)
	})

	it("only returns the shapes asked for", async () => {
		const league = await makeLeague()
		const season = await makeSeason({ leagueId: league.id })
		const { winner } = await seedGame(league, season.id, 24)

		expect(
			await guestPickIds({ perLeague: 1, shapes: ["TEAM_VS_TEAM"] }),
		).toEqual([winner.id])
	})

	it("counts games per league, not overall", async () => {
		const nfl = await makeLeague()
		const nhl = await makeLeague()
		const nflSeason = await makeSeason({ leagueId: nfl.id })
		const nhlSeason = await makeSeason({ leagueId: nhl.id })
		const nflGame = await seedGame(nfl, nflSeason.id, 24)
		const nhlGame = await seedGame(nhl, nhlSeason.id, 200)

		const ids = await guestPickIds({ perLeague: 1, shapes: ["TEAM_VS_TEAM"] })

		expect(ids).toEqual([nflGame.winner.id, nhlGame.winner.id])
	})
})
