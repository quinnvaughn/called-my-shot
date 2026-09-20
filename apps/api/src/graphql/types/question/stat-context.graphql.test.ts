import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { playerGameStats } from "../../../db/schema"
import {
	HOUR,
	makeGame,
	makeLeague,
	makeOption,
	makePlayer,
	makeQuestion,
	makeSeason,
	makeStat,
	makeTeam,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"

const NOW = new Date("2026-09-12T12:00:00Z")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * HOUR)

const QUERY = `
	query ($id: ID!) {
		question(id: $id) {
			statContext {
				statLabel
				lastN
				subjects {
					label
					recentGames { value didNotPlay isHome }
					seasonToDate { games mean overLine }
					home { games mean }
					away { games mean }
					rest { medianRestDays }
					opponentAllowed { meanAllowed positions }
					teamShare { sharePct }
				}
			}
		}
	}
`

type Split = { games: number; mean: number; overLine: number | null }
type Result = {
	statContext: {
		statLabel: string
		lastN: number
		subjects: {
			label: string
			recentGames: { value: number | null; didNotPlay: boolean }[]
			seasonToDate: Split | null
			home: Split | null
			away: Split | null
			rest: { medianRestDays: number } | null
			opponentAllowed: { meanAllowed: number; positions: string[] } | null
			teamShare: { sharePct: number } | null
		}[]
	} | null
}

async function seed() {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({ leagueId: league.id })
	const team = await makeTeam({ leagueId: league.id })
	const opponent = await makeTeam({ leagueId: league.id })
	const stat = await makeStat({ sportId: league.sportId, name: "Points" })
	const game = await makeGame({
		leagueId: league.id,
		seasonId: season.id,
		homeTeamId: team.id,
		awayTeamId: opponent.id,
		startsAt: NOW,
	})
	return { league, season, team, opponent, stat, game }
}

type World = Awaited<ReturnType<typeof seed>>

async function playedGame(
	world: World,
	playerId: string,
	value: number,
	days: number,
) {
	const past = await makeGame({
		leagueId: world.league.id,
		seasonId: world.season.id,
		homeTeamId: world.team.id,
		awayTeamId: world.opponent.id,
		startsAt: daysAgo(days),
		status: "final",
	})
	await db.insert(playerGameStats).values({
		gameId: past.id,
		source: "espn",
		sourceAthleteId: `nba:${playerId}:${days}`,
		playerId,
		teamId: world.team.id,
		opponentTeamId: world.opponent.id,
		isHome: true,
		gameDate: daysAgo(days),
		seasonId: world.season.id,
		leagueId: world.league.id,
		statKey: "points",
		valueText: String(value),
		valueNumeric: value,
		didNotPlay: false,
	})
}

const ask = (id: string) =>
	expectData<{ question: Result | null }>(QUERY, { variables: { id } })

describe("Question.statContext", () => {
	it("returns the cards for a one-sided question", async () => {
		const world = await seed()
		const player = await makePlayer({
			currentTeamId: world.team.id,
			positions: ["SG"],
		})
		await playedGame(world, player.id, 30, 5)
		await playedGame(world, player.id, 20, 3)

		const question = await makeQuestion({
			shape: "player_stat_over_under",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.stat.id,
			subjectPlayerId: player.id,
			ouLine: 22.5,
			locksAt: NOW,
		})

		const { question: row } = await ask(question.id)
		const context = row?.statContext

		expect(context?.statLabel).toBe("Points")
		expect(context?.subjects).toHaveLength(1)
		expect(context?.subjects[0]?.recentGames.map((g) => g.value)).toEqual([
			20, 30,
		])
		// One of the two cleared 22.5.
		expect(context?.subjects[0]?.seasonToDate?.overLine).toBe(1)
	})

	it("returns both sides of a head-to-head", async () => {
		const world = await seed()
		const a = await makePlayer({ currentTeamId: world.team.id })
		const b = await makePlayer({ currentTeamId: world.opponent.id })
		await playedGame(world, a.id, 30, 5)
		await playedGame(world, b.id, 12, 4)

		const question = await makeQuestion({
			shape: "player_vs_player",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.stat.id,
			locksAt: NOW,
		})
		await makeOption(question.id, { label: "A", sortOrder: 0, playerId: a.id })
		await makeOption(question.id, { label: "B", sortOrder: 1, playerId: b.id })

		const { question: row } = await ask(question.id)

		expect(row?.statContext?.subjects.map((s) => s.label)).toEqual(["A", "B"])
	})

	// DefaultFieldNullability is false, so a question with nothing to show has
	// to come back as a null field rather than a field error taking the whole
	// Question down.
	it("is null for a custom stat", async () => {
		const world = await seed()
		const player = await makePlayer({ currentTeamId: world.team.id })
		await playedGame(world, player.id, 30, 5)

		const question = await makeQuestion({
			shape: "player_stat_over_under",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: null,
			customStat: "vibes",
			subjectPlayerId: player.id,
			locksAt: NOW,
		})

		const { question: row } = await ask(question.id)
		expect(row?.statContext).toBeNull()
	})

	it("is null for a subject with no stored history", async () => {
		const world = await seed()
		const player = await makePlayer({ currentTeamId: world.team.id })

		const question = await makeQuestion({
			shape: "player_stat_over_under",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.stat.id,
			subjectPlayerId: player.id,
			ouLine: 22.5,
			locksAt: NOW,
		})

		const { question: row } = await ask(question.id)
		expect(row?.statContext).toBeNull()
	})
})
