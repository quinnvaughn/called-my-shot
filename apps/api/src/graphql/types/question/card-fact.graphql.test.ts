import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { playerGameStats } from "../../../db/schema"
import {
	makeGame,
	makeLeague,
	makePlayer,
	makeQuestion,
	makeSeason,
	makeStat,
	makeTeam,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"
import { daysAgo, hoursFromNow } from "../../../test/helpers"

const QUERY = `
	query ($id: ID!) {
		question(id: $id) {
			cardFact { kind statLabel line sides { label games hits mean } }
		}
	}
`

type Result = {
	question: {
		cardFact: {
			kind: string
			statLabel: string
			line: number | null
			sides: { label: string; games: number; hits: number | null }[]
		} | null
	}
}

// A player line on an upcoming game, with three games played at 30.
async function seed(locksAt: Date) {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({ leagueId: league.id })
	const team = await makeTeam({ leagueId: league.id })
	const opponent = await makeTeam({ leagueId: league.id })
	const player = await makePlayer({
		name: "Jayson Tatum",
		currentTeamId: team.id,
	})
	const stat = await makeStat({ sportId: league.sportId, name: "Points" })
	for (const days of [1, 2, 3]) {
		const game = await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			homeTeamId: team.id,
			awayTeamId: opponent.id,
			startsAt: daysAgo(days),
			status: "final",
		})
		await db.insert(playerGameStats).values({
			gameId: game.id,
			source: "espn",
			sourceAthleteId: `nba:${player.id}`,
			playerId: player.id,
			teamId: team.id,
			opponentTeamId: opponent.id,
			isHome: true,
			gameDate: daysAgo(days),
			seasonId: season.id,
			leagueId: league.id,
			statKey: "points",
			valueText: "30",
			valueNumeric: 30,
			didNotPlay: false,
		})
	}
	const game = await makeGame({
		leagueId: league.id,
		seasonId: season.id,
		homeTeamId: team.id,
		awayTeamId: opponent.id,
		startsAt: locksAt,
	})
	return makeQuestion({
		shape: "player_stat_over_under",
		leagueId: league.id,
		seasonId: season.id,
		gameId: game.id,
		statId: stat.id,
		subjectPlayerId: player.id,
		ouLine: 24.5,
		locksAt,
	})
}

describe("Question.cardFact", () => {
	it("gives an open question its line of recent form", async () => {
		const question = await seed(hoursFromNow(4))

		const data = await expectData<Result>(QUERY, {
			variables: { id: question.id },
		})

		expect(data.question.cardFact).toEqual({
			kind: "LINE_HITS",
			statLabel: "Points",
			line: 24.5,
			sides: [{ label: "Jayson Tatum", games: 3, hits: 3, mean: 30 }],
		})
	})

	it("is null once the question has locked", async () => {
		const question = await seed(daysAgo(0.5))

		const data = await expectData<Result>(QUERY, {
			variables: { id: question.id },
		})

		expect(data.question.cardFact).toBeNull()
	})
})
