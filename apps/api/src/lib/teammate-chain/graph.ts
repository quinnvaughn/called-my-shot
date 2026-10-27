// One league's teammate graph, for building puzzles: players joined through
// the team-seasons they played. Built in memory from player_team_seasons,
// since a puzzle needs searches out from both of its ends.

export type LeagueGraph = {
	// player -> the team-seasons he played, as "teamId:season".
	seasonsOf: Map<string, string[]>
	// "teamId:season" -> who played it.
	rosterOf: Map<string, string[]>
}

// A row's season is a year, or "now" for today's roster, which links this
// season's teammates before the history ingest has them.
export function buildLeagueGraph(
	rows: Iterable<{ playerId: string; teamId: string; season: number | string }>,
): LeagueGraph {
	const seasonsOf = new Map<string, string[]>()
	const rosterOf = new Map<string, string[]>()
	for (const row of rows) {
		const key = `${row.teamId}:${row.season}`
		const seasons = seasonsOf.get(row.playerId)
		if (seasons) seasons.push(key)
		else seasonsOf.set(row.playerId, [key])
		const roster = rosterOf.get(key)
		if (roster) roster.push(row.playerId)
		else rosterOf.set(key, [row.playerId])
	}
	return { seasonsOf, rosterOf }
}

// Everyone a player was ever a teammate of.
export function teammatesOf(graph: LeagueGraph, playerId: string): Set<string> {
	const out = new Set<string>()
	for (const key of graph.seasonsOf.get(playerId) ?? []) {
		for (const other of graph.rosterOf.get(key) ?? []) {
			if (other !== playerId) out.add(other)
		}
	}
	return out
}

// How many links each player is from `from`, out to `maxDepth`. A teammate
// is 1.
export function linkDistances(
	graph: LeagueGraph,
	from: string,
	maxDepth: number,
): Map<string, number> {
	const distance = new Map([[from, 0]])
	const seen = new Set<string>()
	let frontier = [from]
	for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
		const next: string[] = []
		for (const player of frontier) {
			for (const key of graph.seasonsOf.get(player) ?? []) {
				if (seen.has(key)) continue
				seen.add(key)
				for (const other of graph.rosterOf.get(key) ?? []) {
					if (distance.has(other)) continue
					distance.set(other, depth)
					next.push(other)
				}
			}
		}
		frontier = next
	}
	return distance
}

export type ChainRoutes = {
	par: number
	// Every player on some route of par links between the two ends. The
	// more there are, the more ways there are to do it in par.
	routePlayers: Set<string>
	// One par route's middle players, in order, through the best-known
	// players it can.
	parRoute: string[]
}

// The shortest routes from `start` to `target`, or null when they're
// further apart than `maxPar` links.
export function chainRoutes(
	graph: LeagueGraph,
	start: string,
	target: string,
	maxPar: number,
	scoreOf: (playerId: string) => number,
): ChainRoutes | null {
	const fromStart = linkDistances(graph, start, maxPar)
	const par = fromStart.get(target)
	if (par === undefined) return null
	const fromTarget = linkDistances(graph, target, par)
	const routePlayers = new Set<string>()
	for (const [player, d] of fromStart) {
		if (d > 0 && d < par && d + (fromTarget.get(player) ?? Infinity) === par) {
			routePlayers.add(player)
		}
	}

	const parRoute: string[] = []
	let current = start
	for (let step = 1; step < par; step++) {
		let best: string | null = null
		for (const next of teammatesOf(graph, current)) {
			if (fromStart.get(next) !== step || !routePlayers.has(next)) continue
			if (best === null || scoreOf(next) > scoreOf(best)) best = next
		}
		if (best === null) return null
		parRoute.push(best)
		current = best
	}
	return { par, routePlayers, parRoute }
}

export const chainSignature = (a: string, b: string) =>
	a < b ? `${a}:${b}` : `${b}:${a}`

export type ChainPuzzleRules = {
	minPar: number
	maxPar: number
	// The fewest players that have to sit on some par route, so there's more
	// than one way to do it.
	minRoutePlayers: number
}

export type BuiltChainPuzzle = {
	startPlayerId: string
	targetPlayerId: string
	par: number
	parRoute: string[]
	signature: string
}

// A random pair from `pool` (the league's best-known players) that makes a
// puzzle: between minPar and maxPar links apart, with room for different
// routes, never a pair that's run before, and neither end one of `resting`.
// Tries a handful of starts and returns null when none works.
export function buildChainPuzzle(
	graph: LeagueGraph,
	pool: readonly string[],
	rules: ChainPuzzleRules,
	used: ReadonlySet<string>,
	resting: ReadonlySet<string>,
	scoreOf: (playerId: string) => number,
	random: () => number = Math.random,
	attempts = 40,
): BuiltChainPuzzle | null {
	const ready = pool.filter(
		(player) => !resting.has(player) && graph.seasonsOf.has(player),
	)
	if (ready.length < 2) return null
	const randomOf = <T>(list: readonly T[]) =>
		list[Math.floor(random() * list.length)] as T
	for (let attempt = 0; attempt < attempts; attempt++) {
		const start = randomOf(ready)
		const distance = linkDistances(graph, start, rules.maxPar)
		const targets = ready.filter((player) => {
			const d = distance.get(player)
			return (
				d !== undefined &&
				d >= rules.minPar &&
				d <= rules.maxPar &&
				!used.has(chainSignature(start, player))
			)
		})
		if (targets.length === 0) continue
		const target = randomOf(targets)
		const routes = chainRoutes(graph, start, target, rules.maxPar, scoreOf)
		if (!routes || routes.routePlayers.size < rules.minRoutePlayers) continue
		return {
			startPlayerId: start,
			targetPlayerId: target,
			par: routes.par,
			parRoute: routes.parRoute,
			signature: chainSignature(start, target),
		}
	}
	return null
}
