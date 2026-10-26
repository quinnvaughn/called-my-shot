import type { HistoryLeague } from "../franchise-history/franchise-map"

// One pick as a league's draft source gives it.
export type SourcePick = {
	year: number
	// Null for a pick outside the numbered rounds (MLB's supplemental "C-1").
	round: number | null
	overall: number
	// Today's team for the franchise that held the pick, as franchise-map.ts
	// names it, or null for one that folded.
	teamAbbreviation: string | null
	// What the team was called that year, when the source says. The writer
	// falls back to today's name.
	teamName: string | null
	// The player's id in the source the league's franchise history is keyed
	// by (HISTORY_SOURCE), so it lands on the same players row. Null when the
	// source has none for him.
	sourceId: string | null
	name: string
}

// The first draft each source covers, and the first year a player who
// came in undrafted counts as part of a class. The BAA's drafts (1947-49)
// were a handful of territorial picks, and before the NHL's universal draft
// (1969) most players were signed straight off sponsored junior teams, so
// "undrafted" says nothing about either; the NFL's draft data starts in
// 1980. MLB has none: its undrafted players are international signings, who
// belong to no draft year.
export const UNDRAFTED_FROM: Record<HistoryLeague, number | null> = {
	nba: 1950,
	nhl: 1969,
	nfl: 1980,
	mlb: null,
}

// Leagues whose seasons end the calendar year after their draft, so a
// player's first season (stored as the year it ended) is his class plus one.
export const SPLIT_SEASON: Record<HistoryLeague, boolean> = {
	nba: true,
	nhl: true,
	nfl: false,
	mlb: false,
}
