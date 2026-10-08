import { leaderProbabilities } from "@called-my-shot/scoring"
import { poolRanking } from "../stat-context/queries"
import { boxStatSourceFor } from "../stat-context/stat-source"
import {
	PRICING_MIN_SAMPLE,
	type PricedSide,
	pricedSide,
} from "./duel-pricing"

// Prices each player in a "who leads the game" pool from the same model a
// player over/under on the stat is set from: each player's per-game average
// this season, and how that over/under's resolved lines landed against their
// own expectation. Every player draws from that spread around his own
// average, and his chance is how often his draw beats everyone else's (see
// leaderProbabilities), so a dominant favorite is priced like one instead of
// at a rate tuned on the average favorite.
//
// Averages come from stored box scores rather than ESPN's season endpoints:
// a pool is both full rosters, and the box scores carry every player's games
// in one read. A player short of `minGames` played this season isn't priced.
// He keeps the question's own rate and counts as having no chance of
// leading, which is usually right: the ones left out are backups and players
// just back, who rarely lead. Early in a season, when nobody has the games
// yet, the whole pool stays unpriced.
export async function priceLeaderPool(input: {
	leagueSlug: string
	statName: string
	seasonId: string
	// The game's start: the pool's averages are of games before it.
	asOf: Date
	playerIds: string[]
	// See LineRule.minGames: the fewest games an average is worth pricing.
	minGames: number
	ratios: number[]
}): Promise<Map<string, PricedSide>> {
	const priced = new Map<string, PricedSide>()
	if (input.ratios.length < PRICING_MIN_SAMPLE) return priced
	const source = boxStatSourceFor({
		shape: "player_game_stat_leader",
		leagueSlug: input.leagueSlug,
		statName: input.statName,
	})
	if (source?.subject !== "player") return priced

	const ranked = await poolRanking(
		{
			seasonId: input.seasonId,
			statKeys: [...source.statKeys],
			asOf: input.asOf,
		},
		input.playerIds.map((playerId) => ({
			playerId,
			opponentTeamId: null,
			isHome: false,
		})),
		input.playerIds.length,
	)
	const contenders = ranked.filter((row) => row.games >= input.minGames)
	if (contenders.length < 2) return priced

	const chances = leaderProbabilities(
		input.ratios,
		contenders.map((row) => row.mean),
	)
	for (const [i, row] of contenders.entries()) {
		priced.set(row.playerId, pricedSide(chances[i] ?? 0))
	}
	return priced
}
