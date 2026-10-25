import type { RushmorePoolQuery } from "#/graphql/generated/graphql"

export type PoolEntry = RushmorePoolQuery["rushmorePool"][number]

// "1980-1992", or one year for a single season.
export function poolYears(entry: {
	firstSeason: number
	lastSeason: number
}): string {
	return entry.firstSeason === entry.lastSeason
		? `${entry.firstSeason}`
		: `${entry.firstSeason}–${entry.lastSeason}`
}
