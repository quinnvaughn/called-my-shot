import type {
	EspnSeasonStatistics,
	EspnStandingsEntry,
	EspnStandingsGroup,
} from "./espn-client"

// "category.stat" -> value, the same keys the season extractors read
// ("offensive.points", "batting.hits"). A category ESPN leaves out is one the
// athlete or team recorded nothing in.
export function flattenCategorizedStatistics(
	statistics: EspnSeasonStatistics,
): Map<string, number> {
	const values = new Map<string, number>()
	for (const category of statistics.splits.categories) {
		for (const stat of category.stats) {
			if (Number.isFinite(stat.value)) {
				values.set(`${category.name}.${stat.name}`, stat.value)
			}
		}
	}
	return values
}

// espnTeamId -> that team's whole standings row, from every team anywhere in
// the tree (conferences, then divisions, however deep a league nests them).
export function parseStandingsEntries(
	root: EspnStandingsGroup,
): Map<string, EspnStandingsEntry> {
	const entries = new Map<string, EspnStandingsEntry>()
	const walk = (group: EspnStandingsGroup) => {
		for (const entry of group.standings?.entries ?? []) {
			entries.set(entry.team.id, entry)
		}
		for (const child of group.children ?? []) walk(child)
	}
	walk(root)
	return entries
}

// espnTeamId -> wins.
export function parseStandingsWins(
	root: EspnStandingsGroup,
): Map<string, number> {
	const wins = new Map<string, number>()
	for (const [espnTeamId, entry] of parseStandingsEntries(root)) {
		const value = entry.stats.find((stat) => stat.name === "wins")?.value
		if (value !== undefined) wins.set(espnTeamId, value)
	}
	return wins
}
