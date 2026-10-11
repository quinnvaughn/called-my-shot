import { describe, expect, it } from "vitest"
import {
	makeGame,
	makeLeague,
	makeQuestion,
	makeSeason,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"
import { hoursFromNow } from "../../../test/helpers"

// One league with a player-written question on a game, one on the season,
// one official game question and one player-written award.
async function seedLeague() {
	const league = await makeLeague()
	const season = await makeSeason({ leagueId: league.id })
	const game = await makeGame({ leagueId: league.id, seasonId: season.id })
	const inLeague = {
		leagueId: league.id,
		seasonId: season.id,
		locksAt: hoursFromNow(72),
	}
	const playerGame = await makeQuestion({ ...inLeague, gameId: game.id })
	const playerSeason = await makeQuestion(inLeague)
	const officialGame = await makeQuestion({
		...inLeague,
		gameId: game.id,
		isOfficial: true,
	})
	const playerAward = await makeQuestion({
		...inLeague,
		shape: "player_season_award",
		awardName: "MVP",
		awardVerb: "win",
		picksRequired: 1,
	})
	return { league, playerGame, playerSeason, officialGame, playerAward }
}

const FEED = /* GraphQL */ `
	query Feed(
		$leagueId: ID!
		$seasonLong: Boolean
		$excludeSeasonAwards: Boolean
	) {
		questions(
			first: 20
			leagueId: $leagueId
			seasonLong: $seasonLong
			excludeSeasonAwards: $excludeSeasonAwards
		) {
			items { id }
		}
	}
`

type Result = { questions: { items: { id: string }[] } }

describe("the Season tab's list", () => {
	it("lists season questions that aren't awards for the Season tab", async () => {
		const seeded = await seedLeague()
		const data = await expectData<Result>(FEED, {
			variables: {
				leagueId: seeded.league.id,
				seasonLong: true,
				excludeSeasonAwards: true,
			},
		})
		expect(data.questions.items.map((q) => q.id)).toEqual([
			seeded.playerSeason.id,
		])
	})
})
