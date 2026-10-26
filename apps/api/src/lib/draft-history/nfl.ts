import { parseCsv } from "../franchise-history/csv"
import { nflFranchiseTeam } from "../franchise-history/franchise-map"
import { fetchText } from "../franchise-history/http"
import type { Log } from "../franchise-history/types"
import type { SourcePick } from "./types"

// The NFL's drafts from 1980 on, from nflverse's draft table. Picks carry
// the GSIS id the franchise history keys most players by; older ones often
// don't, and are matched by name instead (see write-drafts.ts).

const DRAFT_PICKS =
	"https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv"

// What a franchise was called in the years its draft code doesn't say,
// newest last. Teams that kept their name since 1980 take today's.
const NFL_NAMES: Record<string, [from: number, to: number, name: string][]> = {
	BAL: [
		[1980, 1983, "Baltimore Colts"],
		[1996, 9999, "Baltimore Ravens"],
	],
	STL: [
		[1980, 1987, "St. Louis Cardinals"],
		[1995, 2015, "St. Louis Rams"],
	],
	PHO: [[1988, 1993, "Phoenix Cardinals"]],
	OAK: [[1980, 2019, "Oakland Raiders"]],
	RAI: [[1982, 1994, "Los Angeles Raiders"]],
	RAM: [[1980, 1994, "Los Angeles Rams"]],
	HOU: [
		[1980, 1996, "Houston Oilers"],
		[2002, 9999, "Houston Texans"],
	],
	TEN: [
		[1997, 1998, "Tennessee Oilers"],
		[1999, 9999, "Tennessee Titans"],
	],
	SDG: [[1980, 2016, "San Diego Chargers"]],
	WAS: [
		[1980, 2019, "Washington Redskins"],
		[2020, 2021, "Washington Football Team"],
	],
}

export function nflTeamName(code: string, season: number): string | null {
	for (const [from, to, name] of NFL_NAMES[code] ?? []) {
		if (season >= from && season <= to) return name
	}
	return null
}

export function parseNflDraft(text: string): SourcePick[] {
	return parseCsv(text).map((row) => {
		const year = Number(row.season)
		const code = row.team ?? ""
		return {
			year,
			round: Number(row.round),
			overall: Number(row.pick),
			teamAbbreviation: nflFranchiseTeam(code, year),
			teamName: nflTeamName(code, year),
			sourceId: row.gsis_id || null,
			name: row.pfr_player_name ?? "",
		}
	})
}

export async function loadNflDrafts(log: Log): Promise<SourcePick[]> {
	const picks = parseNflDraft(await fetchText(DRAFT_PICKS))
	log(`nfl: ${picks.length} draft picks`)
	return picks
}
