import { distancesToTarget, pickMystery } from "./help"
import type { ChainChecks, ChainEnds } from "./play"
import { type ChainLeague, loadChainLeague } from "./schedule"
import { loadChainLinks, playersInLeague } from "./teammates"

// The league graph behind hints and the dead-end warning, kept in memory per
// league. Rosters only move when history:ingest runs or the live sync trades
// someone, so an hour's staleness costs nothing a pick could notice: picks
// themselves are always judged against the database.
const LEAGUE_TTL_MS = 60 * 60 * 1000

type Cached<T> = { at: number; value: Promise<T> }

const leagues = new Map<string, Cached<ChainLeague>>()
const targets = new Map<string, Cached<Map<string, number>>>()

function cached<T>(
	cache: Map<string, Cached<T>>,
	key: string,
	load: () => Promise<T>,
): Promise<T> {
	const hit = cache.get(key)
	if (hit && Date.now() - hit.at < LEAGUE_TTL_MS) return hit.value
	const value = load()
	cache.set(key, { at: Date.now(), value })
	// A failed load isn't kept, so the next request tries again.
	value.catch(() => cache.delete(key))
	return value
}

export type ChainPuzzleRef = ChainEnds & {
	id: string
	leagueId: string
	parRoute: readonly string[]
}

// The league's graph and every player's distance to the puzzle's target.
export async function loadChainHelp(puzzle: ChainPuzzleRef) {
	const league = await cached(leagues, puzzle.leagueId, () =>
		loadChainLeague(puzzle.leagueId),
	)
	const toTarget = await cached(
		targets,
		`${puzzle.leagueId}:${puzzle.targetPlayerId}`,
		async () => distancesToTarget(league.graph, puzzle.targetPlayerId),
	)
	return { league, toTarget }
}

// Everything judging a game's inputs needs, for the players they name.
export async function loadChainChecks(
	puzzle: ChainPuzzleRef,
	playerIds: string[],
): Promise<ChainChecks> {
	const [linked, inLeague, help] = await Promise.all([
		loadChainLinks(playerIds),
		playersInLeague(puzzle.leagueId, playerIds),
		loadChainHelp(puzzle),
	])
	return {
		linked,
		inLeague: (id) => inLeague.has(id),
		mystery: (state) =>
			pickMystery(
				help.league.graph,
				puzzle,
				state,
				help.toTarget,
				help.league.scoreOf,
			),
	}
}
