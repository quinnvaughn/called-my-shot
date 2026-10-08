import { LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { playerGameStats } from "../../db/schema"
import {
	HOUR,
	makeGame,
	makeLeague,
	makePlayer,
	makeSeason,
	makeTeam,
} from "../../test/factories"
import { boxStatSourceFor } from "../stat-context/stat-source"
import { LINE_TUNING } from "./line-calibration"
import { priceLeaderPool } from "./leader-pricing"

const NOW = new Date("2026-11-10T16:00:00Z")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * HOUR)

// Spread evenly from 0.8x to 1.2x their expectation.
const evenRatios = (count = LINE_TUNING.minSample) =>
	Array.from({ length: count }, (_, i) => 0.8 + (0.4 * i) / (count - 1))

const pointsKey = () => {
	const source = boxStatSourceFor({
		shape: "player_game_stat_leader",
		leagueSlug: "nba",
		statName: "Points",
	})
	const [key] = source?.statKeys ?? []
	if (!key) throw new Error("no box score key for NBA points")
	return key
}

// An NBA season where each player scored their `points` in each of `games`
// finals before NOW.
async function seedPool(players: { points: number; games: number }[]) {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({ leagueId: league.id })
	const team = await makeTeam({ leagueId: league.id })
	const opponent = await makeTeam({ leagueId: league.id })
	const statKey = pointsKey()
	const ids: string[] = []
	for (const { points, games } of players) {
		const player = await makePlayer({ currentTeamId: team.id })
		ids.push(player.id)
		for (let i = 0; i < games; i++) {
			const game = await makeGame({
				leagueId: league.id,
				seasonId: season.id,
				homeTeamId: team.id,
				awayTeamId: opponent.id,
				startsAt: daysAgo(i + 1),
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
				gameDate: daysAgo(i + 1),
				seasonId: season.id,
				leagueId: league.id,
				statKey,
				valueText: String(points),
				valueNumeric: points,
				didNotPlay: false,
			})
		}
	}
	return { seasonId: season.id, ids }
}

const price = (
	seasonId: string,
	playerIds: string[],
	ratios = evenRatios(),
	minGames = 3,
) =>
	priceLeaderPool({
		leagueSlug: "nba",
		statName: "Points",
		seasonId,
		asOf: NOW,
		playerIds,
		minGames,
		ratios,
	})

describe("priceLeaderPool", () => {
	it("prices a dominant scorer as the favorite and the rest as long shots", async () => {
		const { seasonId, ids } = await seedPool([
			{ points: 30, games: 5 },
			{ points: 22, games: 5 },
			{ points: 20, games: 5 },
		])
		const [star, second, third] = ids
		const prices = await price(seasonId, ids)

		const starPrice = star ? prices.get(star) : undefined
		expect(starPrice?.modelHitRate).toBeGreaterThan(0.5)
		expect(starPrice?.winMult).toBe(1)
		expect(starPrice?.lossRate).toBeGreaterThan(
			LOSS_RATE_BY_SHAPE.team_vs_team,
		)
		for (const id of [second, third]) {
			expect(id ? prices.get(id)?.winMult : 0).toBeGreaterThan(1)
		}
	})

	it("leaves a player short of the games unpriced", async () => {
		const { seasonId, ids } = await seedPool([
			{ points: 30, games: 5 },
			{ points: 22, games: 5 },
			{ points: 40, games: 1 },
		])
		const [, , rookie] = ids
		const prices = await price(seasonId, ids)

		expect(prices.size).toBe(2)
		expect(rookie ? prices.has(rookie) : true).toBe(false)
	})

	it("stays unpriced with fewer than two players to price", async () => {
		const { seasonId, ids } = await seedPool([
			{ points: 30, games: 5 },
			{ points: 22, games: 1 },
		])

		expect((await price(seasonId, ids)).size).toBe(0)
	})

	it("waits for enough resolved lines", async () => {
		const { seasonId, ids } = await seedPool([
			{ points: 30, games: 5 },
			{ points: 22, games: 5 },
		])

		expect(
			(await price(seasonId, ids, evenRatios(LINE_TUNING.minSample - 1)))
				.size,
		).toBe(0)
	})
})
