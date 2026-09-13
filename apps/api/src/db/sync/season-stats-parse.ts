import type { EspnSeasonStatistics, EspnStandingsGroup } from "./espn-client"

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

// espnTeamId -> wins, from every team anywhere in the standings tree
// (conferences, then divisions, however deep a league nests them).
export function parseStandingsWins(
	root: EspnStandingsGroup,
): Map<string, number> {
	const wins = new Map<string, number>()
	const walk = (group: EspnStandingsGroup) => {
		for (const entry of group.standings?.entries ?? []) {
			const value = entry.stats.find((stat) => stat.name === "wins")?.value
			if (value !== undefined) wins.set(entry.team.id, value)
		}
		for (const child of group.children ?? []) walk(child)
	}
	walk(root)
	return wins
}
