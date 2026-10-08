import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../db"
import { playerGameStats, teamGameStats } from "../../db/schema"
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
} from "../../test/factories"
import { loadCardFacts } from "./build"

const NOW = new Date("2026-09-12T12:00:00Z")
const DAY = 24 * HOUR
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)

type World = Awaited<ReturnType<typeof seedWorld>>

async function seedWorld() {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({ leagueId: league.id })
	const team = await makeTeam({ leagueId: league.id, abbreviation: "BOS" })
	const opponent = await makeTeam({ leagueId: league.id, abbreviation: "NYK" })
	const player = await makePlayer({
		name: "Jayson Tatum",
		currentTeamId: team.id,
	})
	const rival = await makePlayer({
		name: "Jalen Brunson",
		currentTeamId: opponent.id,
	})
	const points = await makeStat({ sportId: league.sportId, name: "Points" })
	// The game every question below is asked about, locking at NOW.
	const game = await makeGame({
		leagueId: league.id,
		seasonId: season.id,
		homeTeamId: team.id,
		awayTeamId: opponent.id,
		startsAt: NOW,
	})
	return { league, season, team, opponent, player, rival, points, game }
}

let world: World

beforeEach(async () => {
	world = await seedWorld()
})

// A finished game with one stored row per player value given.
async function playedGame(
	daysBack: number,
	values: {
		playerId: string | null
		athlete?: string
		value: number | null
		didNotPlay?: boolean
	}[],
) {
	const game = await makeGame({
		leagueId: world.league.id,
		seasonId: world.season.id,
		homeTeamId: world.team.id,
		awayTeamId: world.opponent.id,
		startsAt: daysAgo(daysBack),
		status: "final",
	})
	for (const row of values) {
		await db.insert(playerGameStats).values({
			gameId: game.id,
			source: "espn",
			sourceAthleteId: row.athlete ?? `nba:${row.playerId}`,
			playerId: row.playerId,
			teamId: world.team.id,
			opponentTeamId: world.opponent.id,
			isHome: true,
			gameDate: daysAgo(daysBack),
			seasonId: world.season.id,
			leagueId: world.league.id,
			statKey: "points",
			valueText: String(row.value ?? "--"),
			valueNumeric: row.value,
			didNotPlay: row.didNotPlay ?? false,
		})
	}
	return game
}

const playerLine = (ouLine: number) =>
	makeQuestion({
		shape: "player_stat_over_under",
		leagueId: world.league.id,
		seasonId: world.season.id,
		gameId: world.game.id,
		statId: world.points.id,
		subjectPlayerId: world.player.id,
		ouLine,
		locksAt: NOW,
	})

describe("loadCardFacts", () => {
	it("counts a player's last ten games played over the line", async () => {
		for (const [i, value] of [
			30, 10, 30, 10, 30, 30, 10, 30, 10, 30, 99, 99,
		].map((v, i) => [i, v] as const)) {
			await playedGame(i + 1, [{ playerId: world.player.id, value }])
		}
		const question = await playerLine(20.5)

		const [fact] = await loadCardFacts([question.id])

		// The two 99s are the 11th and 12th most recent, outside the window.
		expect(fact).toEqual({
			kind: "line_hits",
			statLabel: "Points",
			line: 20.5,
			sides: [{ label: "Jayson Tatum", games: 10, hits: 6, mean: 22 }],
		})
	})

	it("skips nights off and empty rows rather than counting them as games", async () => {
		await playedGame(1, [{ playerId: world.player.id, value: 30 }])
		await playedGame(2, [
			{ playerId: world.player.id, value: null, didNotPlay: true },
		])
		await playedGame(3, [{ playerId: world.player.id, value: null }])
		await playedGame(4, [{ playerId: world.player.id, value: 10 }])
		await playedGame(5, [{ playerId: world.player.id, value: 25 }])
		const question = await playerLine(20.5)

		const [fact] = await loadCardFacts([question.id])

		expect(fact?.sides[0]).toMatchObject({ games: 3, hits: 2 })
	})

	it("leaves out anything at or after the lock", async () => {
		for (const days of [1, 2, 3]) {
			await playedGame(days, [{ playerId: world.player.id, value: 10 }])
		}
		await playedGame(-1, [{ playerId: world.player.id, value: 40 }])
		const question = await playerLine(20.5)

		const [fact] = await loadCardFacts([question.id])

		expect(fact?.sides[0]).toMatchObject({ games: 3, hits: 0 })
	})

	it("has nothing to say under three games", async () => {
		await playedGame(1, [{ playerId: world.player.id, value: 30 }])
		await playedGame(2, [{ playerId: world.player.id, value: 30 }])
		const question = await playerLine(20.5)

		expect(await loadCardFacts([question.id])).toEqual([null])
	})

	it("reads a team line off the scope its stat resolves from", async () => {
		for (const [i, score] of [110, 100, 120, 90].entries()) {
			const game = await makeGame({
				leagueId: world.league.id,
				seasonId: world.season.id,
				homeTeamId: world.team.id,
				awayTeamId: world.opponent.id,
				startsAt: daysAgo(i + 1),
				status: "final",
			})
			await db.insert(teamGameStats).values({
				gameId: game.id,
				source: "espn",
				teamId: world.team.id,
				opponentTeamId: world.opponent.id,
				isHome: true,
				gameDate: daysAgo(i + 1),
				seasonId: world.season.id,
				leagueId: world.league.id,
				scope: "final_score",
				statKey: "score",
				valueText: String(score),
				valueNumeric: score,
			})
		}
		const question = await makeQuestion({
			shape: "team_stat_over_under",
			leagueId: world.league.id,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.points.id,
			subjectTeamId: world.team.id,
			ouLine: 105.5,
			locksAt: NOW,
		})

		const [fact] = await loadCardFacts([question.id])

		expect(fact).toMatchObject({
			kind: "line_hits",
			sides: [{ games: 4, hits: 2, mean: 105 }],
		})
	})

	it("counts each team's games over a game total's line from the final scores", async () => {
		const other = await makeTeam({ leagueId: world.league.id })
		const final = (
			days: number,
			home: string,
			away: string,
			a: number,
			b: number,
		) =>
			makeGame({
				leagueId: world.league.id,
				seasonId: world.season.id,
				homeTeamId: home,
				awayTeamId: away,
				startsAt: daysAgo(days),
				status: "final",
				homeScore: a,
				awayScore: b,
			})
		// BOS: 230, 200, 240. NYK: 200, 190, 240 (the meeting counts for both).
		await final(1, world.team.id, other.id, 120, 110)
		await final(2, other.id, world.team.id, 100, 100)
		await final(3, world.team.id, world.opponent.id, 130, 110)
		await final(4, world.opponent.id, other.id, 100, 100)
		await final(5, other.id, world.opponent.id, 95, 95)
		const question = await makeQuestion({
			shape: "game_total_over_under",
			leagueId: world.league.id,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.points.id,
			ouLine: 215.5,
			locksAt: NOW,
		})

		const [fact] = await loadCardFacts([question.id])

		expect(fact?.kind).toBe("total_hits")
		expect(fact?.sides).toEqual([
			{ label: "NYK", games: 3, hits: 1, mean: 210 },
			{ label: "BOS", games: 3, hits: 2, mean: 223.333 },
		])
	})

	it("averages both sides of a head to head, or neither", async () => {
		for (const days of [1, 2, 3]) {
			await playedGame(days, [
				{ playerId: world.player.id, value: 30 },
				{ playerId: world.rival.id, value: 24 },
			])
		}
		const question = await makeQuestion({
			shape: "player_vs_player",
			leagueId: world.league.id,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.points.id,
			locksAt: NOW,
		})
		await makeOption(question.id, {
			label: "Jalen Brunson",
			playerId: world.rival.id,
			sortOrder: 0,
		})
		await makeOption(question.id, {
			label: "Jayson Tatum",
			playerId: world.player.id,
			sortOrder: 1,
		})

		const [fact] = await loadCardFacts([question.id])

		expect(fact).toEqual({
			kind: "averages",
			statLabel: "Points",
			line: null,
			sides: [
				{ label: "Jalen Brunson", games: 3, hits: null, mean: 24 },
				{ label: "Jayson Tatum", games: 3, hits: null, mean: 30 },
			],
		})
	})

	it("counts the leader favorite's games led, a tie at the top included", async () => {
		// Led, tied for the lead, beaten by someone with no player link.
		await playedGame(1, [
			{ playerId: world.player.id, value: 30 },
			{ playerId: world.rival.id, value: 20 },
		])
		await playedGame(2, [
			{ playerId: world.player.id, value: 25 },
			{ playerId: world.rival.id, value: 25 },
		])
		await playedGame(3, [
			{ playerId: world.player.id, value: 25 },
			{ playerId: null, athlete: "nba:unlinked", value: 40 },
		])
		const question = await makeQuestion({
			shape: "player_game_stat_leader",
			leagueId: world.league.id,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.points.id,
			locksAt: NOW,
			leaderBasis: {
				favoritePlayerId: world.player.id,
				favoriteMean: 26,
				contenders: 2,
			},
		})
		await makeOption(question.id, {
			label: "Jayson Tatum",
			playerId: world.player.id,
			sortOrder: 0,
		})
		await makeOption(question.id, {
			label: "Jalen Brunson",
			playerId: world.rival.id,
			sortOrder: 1,
		})

		const [fact] = await loadCardFacts([question.id])

		expect(fact).toMatchObject({
			kind: "leader_hits",
			sides: [{ label: "Jayson Tatum", games: 3, hits: 2 }],
		})
	})

	it("answers a page of questions in key order, null where there is no fact", async () => {
		for (const days of [1, 2, 3]) {
			await playedGame(days, [{ playerId: world.player.id, value: 30 }])
		}
		const low = await playerLine(20.5)
		const high = await playerLine(40.5)
		const winner = await makeQuestion({
			shape: "team_vs_team",
			leagueId: world.league.id,
			seasonId: world.season.id,
			gameId: world.game.id,
			locksAt: NOW,
		})

		const facts = await loadCardFacts([high.id, winner.id, low.id])

		expect(facts.map((f) => f?.sides[0]?.hits ?? null)).toEqual([0, null, 3])
	})
})
