// The positions a Rushmore prompt can be narrowed to, per league, keyed by
// the league's abbreviation. A prompt can name several ("PG", "SG"); a player
// fits if any of his positions is one of them. Each code here is what
// player_franchise_stints.positions holds for that league (see
// lib/franchise-history/positions.ts in the api, which maps every source's
// own position names onto these).

export type RushmorePosition = { code: string; label: string }

export const RUSHMORE_POSITIONS: Record<string, readonly RushmorePosition[]> = {
	NBA: [
		{ code: "PG", label: "Point guard" },
		{ code: "SG", label: "Shooting guard" },
		{ code: "SF", label: "Small forward" },
		{ code: "PF", label: "Power forward" },
		{ code: "C", label: "Center" },
	],
	NFL: [
		{ code: "QB", label: "Quarterback" },
		{ code: "RB", label: "Running back" },
		{ code: "WR", label: "Wide receiver" },
		{ code: "TE", label: "Tight end" },
		{ code: "OL", label: "Offensive line" },
		{ code: "DL", label: "Defensive line" },
		{ code: "LB", label: "Linebacker" },
		{ code: "DB", label: "Defensive back" },
		{ code: "K", label: "Kicker or punter" },
	],
	MLB: [
		{ code: "P", label: "Pitcher" },
		{ code: "C", label: "Catcher" },
		{ code: "1B", label: "First base" },
		{ code: "2B", label: "Second base" },
		{ code: "3B", label: "Third base" },
		{ code: "SS", label: "Shortstop" },
		{ code: "OF", label: "Outfield" },
		{ code: "DH", label: "Designated hitter" },
	],
	NHL: [
		{ code: "C", label: "Center" },
		{ code: "LW", label: "Left wing" },
		{ code: "RW", label: "Right wing" },
		{ code: "D", label: "Defense" },
		{ code: "G", label: "Goalie" },
	],
}

export function rushmorePositionsFor(
	leagueAbbreviation: string,
): readonly RushmorePosition[] {
	return RUSHMORE_POSITIONS[leagueAbbreviation] ?? []
}

// The earliest and latest year a prompt's played-between range can name.
export const RUSHMORE_YEAR_MIN = 1870
export const RUSHMORE_YEAR_MAX = 2100
