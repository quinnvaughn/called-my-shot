import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { playerGameStats, teamGameStats } from "../../db/schema"
import {
	HOUR,
	makeGame,
	makeLeague,
	makePlayer,
	makeSeason,
	makeTeam,
} from "../../test/factories"
import { boxStatSourceFor } from "../stat-context/stat-source"
import { playerBoxSpread, teamScoreBoxSpread } from "./box-spread"

const NOW = new Date("2026-11-10T16:00:00Z")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * HOUR)

const pointsKey = () => {
	const [key] =
		boxStatSourceFor({
			shape: "player_stat_over_under",
			leagueSlug: "nba",
			statName: "Points",
		})?.statKeys ?? []
	if (!key) throw new Error("no box score key for NBA points")
	return key
}

type Matchup = {
	home: number
	away: number
	seasonId: string
	seasonType?: "regular" | "postseason"
}

// The same two teams playing each `games` entry in order, a day apart and
// ending a day before NOW: each side's one player scoring `home`/`away`
// points, and its team scoring four times that.
async function seedGames(leagueId: string, games: Matchup[]) {
	const homeTeam = await makeTeam({ leagueId })
	const awayTeam = await makeTeam({ leagueId })
	const homePlayer = await makePlayer({ currentTeamId: homeTeam.id })
	const awayPlayer = await makePlayer({ currentTeamId: awayTeam.id })
	const statKey = pointsKey()
	for (const [i, matchup] of games.entries()) {
		const date = daysAgo(games.length - i)
		const game = await makeGame({
			leagueId,
			seasonId: matchup.seasonId,
			homeTeamId: homeTeam.id,
			awayTeamId: awayTeam.id,
			startsAt: date,
			status: "final",
			seasonType: matchup.seasonType ?? "regular",
		})
		for (const [player, team, opponent, isHome, value] of [
			[homePlayer, homeTeam, awayTeam, true, matchup.home],
			[awayPlayer, awayTeam, homeTeam, false, matchup.away],
		] as const) {
			const context = {
				gameId: game.id,
				source: "espn" as const,
				teamId: team.id,
				opponentTeamId: opponent.id,
				isHome,
				gameDate: date,
				seasonId: matchup.seasonId,
				leagueId,
			}
			await db.insert(playerGameStats).values({
				...context,
				sourceAthleteId: `nba:${player.id}`,
				playerId: player.id,
				statKey,
				valueText: String(value),
				valueNumeric: value,
				didNotPlay: false,
			})
			await db.insert(teamGameStats).values({
				...context,
				scope: "final_score",
				statKey: "score",
				valueText: String(value * 4),
				valueNumeric: value * 4,
			})
		}
	}
}

async function nbaLeague() {
	const league = await makeLeague({ slug: "nba" })
	const lastSeason = await makeSeason({ leagueId: league.id, year: 2025 })
	const season = await makeSeason({ leagueId: league.id, year: 2026 })
	return { league, lastSeason, season }
}

const pointsSpread = (leagueId: string) =>
	playerBoxSpread({
		leagueId,
		leagueSlug: "nba",
		statName: "Points",
		asOf: NOW,
	})

describe("playerBoxSpread", () => {
	it("measures each game against the average of the ones before it", async () => {
		const { league, season } = await nbaLeague()
		await seedGames(league.id, [
			{ home: 20, away: 10, seasonId: season.id },
			{ home: 20, away: 10, seasonId: season.id },
			{ home: 30, away: 5, seasonId: season.id },
		])

		const spread = await pointsSpread(league.id)
		expect([...spread.ratios].sort()).toEqual([0.5, 1.5])
		expect(spread.pairs).toEqual([{ home: 1.5, away: 0.5 }])
	})

	it("needs two games before one for an average", async () => {
		const { league, season } = await nbaLeague()
		await seedGames(league.id, [
			{ home: 20, away: 10, seasonId: season.id },
			{ home: 30, away: 5, seasonId: season.id },
		])

		expect((await pointsSpread(league.id)).ratios).toEqual([])
	})

	it("counts last season's games, each against that season's own average", async () => {
		const { league, lastSeason, season } = await nbaLeague()
		await seedGames(league.id, [
			{ home: 20, away: 10, seasonId: lastSeason.id },
			{ home: 20, away: 10, seasonId: lastSeason.id },
			{ home: 40, away: 20, seasonId: lastSeason.id },
			// A new season's first game has nothing before it that season,
			// however many games came before it last season.
			{ home: 60, away: 60, seasonId: season.id },
		])

		expect((await pointsSpread(league.id)).ratios).toEqual([2, 2])
	})
})

describe("teamScoreBoxSpread", () => {
	it("pairs each game's home and away scores against their own averages", async () => {
		const { league, season } = await nbaLeague()
		await seedGames(league.id, [
			{ home: 25, away: 25, seasonId: season.id },
			{ home: 25, away: 25, seasonId: season.id },
			{ home: 30, away: 20, seasonId: season.id },
		])

		const spread = await teamScoreBoxSpread({ leagueId: league.id, asOf: NOW })
		expect(spread.pairs).toEqual([{ home: 1.2, away: 0.8 }])
	})

	it("leaves postseason games out when asked to", async () => {
		const { league, season } = await nbaLeague()
		await seedGames(league.id, [
			{ home: 25, away: 25, seasonId: season.id },
			{ home: 25, away: 25, seasonId: season.id },
			{ home: 30, away: 20, seasonId: season.id },
			{ home: 20, away: 20, seasonId: season.id, seasonType: "postseason" },
		])

		const spread = await teamScoreBoxSpread({
			leagueId: league.id,
			asOf: NOW,
			regularSeasonOnly: true,
		})
		expect(spread.pairs).toEqual([{ home: 1.2, away: 0.8 }])
	})
})
