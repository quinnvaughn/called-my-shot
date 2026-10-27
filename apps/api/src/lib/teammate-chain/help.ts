import { type LeagueGraph, linkDistances, teammatesOf } from "./graph"
import { CHAIN_MAX_MIDDLE, type ChainEnds, type ChainState } from "./play"

// The help a game gets from the league's teammate graph: whether the chain
// can still reach the target, and the mystery teammate a hint is about.
// Pure over a graph and each player's distance to the target, so the rules
// are testable without a database.

// How many links the chain's last player has left to reach the target: the
// room for middle players still open, plus the link into the target.
export function linksLeft(state: ChainState): number {
	return CHAIN_MAX_MIDDLE - state.chain.length + 1
}

// Every player's distance in links to the target, out as far as any chain
// can reach.
export function distancesToTarget(
	graph: LeagueGraph,
	targetPlayerId: string,
): Map<string, number> {
	return linkDistances(graph, targetPlayerId, CHAIN_MAX_MIDDLE + 1)
}

const chainEnd = (ends: ChainEnds, state: ChainState) =>
	state.chain.at(-1) ?? ends.startPlayerId

// No route from the chain's last player reaches the target in the links
// left: whatever comes next, a player has to be taken back first.
export function isDeadEnd(
	ends: ChainEnds,
	state: ChainState,
	toTarget: ReadonlyMap<string, number>,
): boolean {
	if (state.over) return false
	const distance = toTarget.get(chainEnd(ends, state))
	return distance === undefined || distance > linksLeft(state)
}

// The teammate of the chain's last player the next hint is about, or null
// at a dead end. While the chain is still the start of the par route (the
// one giving up shows), it's that route's next player, so hints and the
// give-up answer agree. Off it, it's whoever stays on a shortest route from
// here, the best-known first. The same chain always gets the same player,
// which guest play needs, since it judges its inputs again on every
// request.
export function pickMystery(
	graph: LeagueGraph,
	ends: ChainEnds & { parRoute: readonly string[] },
	state: ChainState,
	toTarget: ReadonlyMap<string, number>,
	scoreOf: (playerId: string) => number,
): string | null {
	const end = chainEnd(ends, state)
	const left = linksLeft(state)
	const taken = new Set([
		ends.startPlayerId,
		ends.targetPlayerId,
		...state.chain,
	])
	const fits = [...teammatesOf(graph, end)].filter((playerId) => {
		if (taken.has(playerId)) return false
		const distance = toTarget.get(playerId)
		return distance !== undefined && distance <= left - 1
	})
	if (fits.length === 0) return null

	const onParRoute = state.chain.every((id, i) => ends.parRoute[i] === id)
	const nextOnRoute = ends.parRoute[state.chain.length]
	if (onParRoute && nextOnRoute && fits.includes(nextOnRoute)) {
		return nextOnRoute
	}

	const distance = (id: string) => toTarget.get(id) ?? Number.POSITIVE_INFINITY
	const shortest = Math.min(...fits.map(distance))
	return (
		fits
			.filter((id) => distance(id) === shortest)
			.sort((a, b) => scoreOf(b) - scoreOf(a) || a.localeCompare(b))[0] ?? null
	)
}
