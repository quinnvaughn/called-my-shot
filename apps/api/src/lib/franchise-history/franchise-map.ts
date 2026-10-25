import { eq } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db"
import { teams } from "../../db/schema"

// Which of today's teams each source's franchise belongs to, as the
// abbreviation our teams table (synced from ESPN) gives it. A source row
// that maps to null was a franchise that no longer exists, or one this app
// has no team for, and is dropped from the pools.

export const HISTORY_LEAGUES = ["nba", "mlb", "nhl", "nfl"] as const
export type HistoryLeague = (typeof HISTORY_LEAGUES)[number]

export const isHistoryLeague = (slug: string): slug is HistoryLeague =>
	(HISTORY_LEAGUES as readonly string[]).includes(slug)

// Basketball-Reference franchise codes, the ones its /teams/{code}/ pages are
// keyed by. Each page already folds a franchise's past names and cities in
// (NJN holds the New Jersey and New York Nets, SAC the Rochester Royals), and
// follows the league's own record keeping for Charlotte: CHA holds the
// 1988-2002 Hornets, NOH starts in 2002-03.
export const NBA_FRANCHISES: Record<string, string> = {
	ATL: "ATL",
	BOS: "BOS",
	NJN: "BKN",
	CHA: "CHA",
	CHI: "CHI",
	CLE: "CLE",
	DAL: "DAL",
	DEN: "DEN",
	DET: "DET",
	GSW: "GS",
	HOU: "HOU",
	IND: "IND",
	LAC: "LAC",
	LAL: "LAL",
	MEM: "MEM",
	MIA: "MIA",
	MIL: "MIL",
	MIN: "MIN",
	NOH: "NO",
	NYK: "NY",
	OKC: "OKC",
	ORL: "ORL",
	PHI: "PHI",
	PHO: "PHX",
	POR: "POR",
	SAC: "SAC",
	SAS: "SA",
	TOR: "TOR",
	UTA: "UTAH",
	WAS: "WSH",
}

// statsapi.mlb.com team ids. MLB keeps one id per franchise across moves and
// renames (147 is the 1903 Highlanders as much as today's Yankees), so a
// roster read by id and season already lands on the right franchise.
export const MLB_FRANCHISES: Record<number, string> = {
	108: "LAA",
	109: "ARI",
	110: "BAL",
	111: "BOS",
	112: "CHC",
	113: "CIN",
	114: "CLE",
	115: "COL",
	116: "DET",
	117: "HOU",
	118: "KC",
	119: "LAD",
	120: "WSH",
	121: "NYM",
	133: "ATH",
	134: "PIT",
	135: "SD",
	136: "SEA",
	137: "SF",
	138: "STL",
	139: "TB",
	140: "TEX",
	141: "TOR",
	142: "MIN",
	143: "PHI",
	144: "ATL",
	145: "CHW",
	146: "MIA",
	147: "NYY",
	158: "MIL",
}

// records.nhl.com franchise ids. Defunct franchises (the Wanderers, the
// Maroons, the Cleveland Barons...) are absent and drop out.
const NHL_FRANCHISES: Record<number, string> = {
	1: "MTL",
	5: "TOR",
	6: "BOS",
	10: "NYR",
	11: "CHI",
	12: "DET",
	14: "LA",
	15: "DAL",
	16: "PHI",
	17: "PIT",
	18: "STL",
	19: "BUF",
	20: "VAN",
	21: "CGY",
	22: "NYI",
	23: "NJ",
	24: "WSH",
	25: "EDM",
	26: "CAR",
	27: "COL",
	29: "SJ",
	30: "OTT",
	31: "TB",
	32: "ANA",
	33: "FLA",
	34: "NSH",
	35: "WPG",
	36: "CBJ",
	37: "MIN",
	38: "VGK",
	39: "SEA",
	40: "UTAH",
}

// Where the Arizona Coyotes' history goes: franchise 28, plus the original
// Winnipeg Jets (WIN, 1979-96) it moved from. Null while this app has no
// Coyotes team. Utah is not that franchise's continuation in the league's
// own records (it's franchise 40, starting 2024-25), so its pool holds only
// players who have played in Utah.
const ARIZONA_LINEAGE: string | null = null

// The NHL's records file the original Winnipeg Jets under franchise 35 with
// the Thrashers and today's Jets, one career row per player per franchise
// with the teams it covers in teamAbbrevs ("WIN", "ATL,WPG"). A row that is
// only WIN belongs to the Coyotes' lineage instead. A rare row spanning both
// (a Jet of the '90s who later played in Atlanta) stays with the Jets, since
// its totals can't be split.
export function nhlFranchiseTeam(
	franchiseId: number,
	teamAbbrevs: string,
): string | null {
	if (franchiseId === 28) return ARIZONA_LINEAGE
	if (franchiseId === 35 && teamAbbrevs.trim() === "WIN") return ARIZONA_LINEAGE
	return NHL_FRANCHISES[franchiseId] ?? null
}

// nflverse roster team codes mean different franchises in different eras:
// BAL is the Colts for 1953-83 and the Ravens from 1996, STL the Cardinals
// until 1987 and the Rams from 1995, HOU the Oilers (now the Titans) until
// 1996 and the Texans after, and 1920s CLE/DET/KC/LA are teams that folded.
// So each code is a list of season ranges. Seasons outside every range
// (folded teams, and 1946-49, when CLE, SF, BAL, BUF and MIA were in the
// AAFC) drop out. The 1943 Steagles (P-P) and 1944 Card-Pitt (C-P) were
// mergers of two franchises and drop out too.
//
// GSIS used ARZ/BLT/CLV/HST/SL for 2002-15, and Pro-Football-Reference's
// codes (GNB, NWE...) turn up in nflverse's draft table, so both are here.
const NFL_RANGES: Record<string, [from: number, to: number, team: string][]> = {
	ARI: [[1988, 9999, "ARI"]],
	ARZ: [[1988, 9999, "ARI"]],
	PHO: [[1988, 1993, "ARI"]],
	CHC: [[1920, 1959, "ARI"]],
	ATL: [[1966, 9999, "ATL"]],
	BAL: [
		[1953, 1983, "IND"],
		[1996, 9999, "BAL"],
	],
	BLT: [[1996, 9999, "BAL"]],
	BUF: [[1960, 9999, "BUF"]],
	CAR: [[1995, 9999, "CAR"]],
	CHI: [[1920, 9999, "CHI"]],
	CHB: [[1920, 9999, "CHI"]],
	CHS: [[1921, 1921, "CHI"]],
	DEC: [[1920, 1920, "CHI"]],
	CIN: [[1968, 9999, "CIN"]],
	CLE: [
		[1937, 1945, "LAR"],
		[1950, 9999, "CLE"],
	],
	CLV: [[1999, 9999, "CLE"]],
	COW: [[1960, 1962, "DAL"]],
	DAL: [[1960, 9999, "DAL"]],
	DEN: [[1960, 9999, "DEN"]],
	DET: [[1934, 9999, "DET"]],
	POR: [[1930, 1933, "DET"]],
	GB: [[1921, 9999, "GB"]],
	GNB: [[1921, 9999, "GB"]],
	HOU: [
		[1960, 1996, "TEN"],
		[2002, 9999, "HOU"],
	],
	HST: [[2002, 9999, "HOU"]],
	TEN: [[1997, 9999, "TEN"]],
	IND: [[1984, 9999, "IND"]],
	JAX: [[1995, 9999, "JAX"]],
	KC: [[1960, 9999, "KC"]],
	KAN: [[1960, 9999, "KC"]],
	TEX: [[1960, 1962, "KC"]],
	LAC: [[1960, 9999, "LAC"]],
	SD: [[1961, 2016, "LAC"]],
	SDG: [[1961, 2016, "LAC"]],
	CHR: [[1960, 1960, "LAC"]],
	LA: [[1937, 9999, "LAR"]],
	LAR: [[1937, 9999, "LAR"]],
	RAM: [[1937, 9999, "LAR"]],
	SL: [[1995, 2015, "LAR"]],
	STL: [
		[1960, 1987, "ARI"],
		[1995, 2015, "LAR"],
	],
	LV: [[1960, 9999, "LV"]],
	LVR: [[1960, 9999, "LV"]],
	OAK: [[1960, 9999, "LV"]],
	RAI: [[1960, 9999, "LV"]],
	MIA: [[1966, 9999, "MIA"]],
	MIN: [[1961, 9999, "MIN"]],
	NE: [[1960, 9999, "NE"]],
	NWE: [[1960, 9999, "NE"]],
	BOS: [
		[1932, 1936, "WSH"],
		[1960, 1970, "NE"],
	],
	NO: [[1967, 9999, "NO"]],
	NOR: [[1967, 9999, "NO"]],
	NYG: [[1925, 9999, "NYG"]],
	NY: [[1925, 9999, "NYG"]],
	NYJ: [[1960, 9999, "NYJ"]],
	NYT: [[1960, 1962, "NYJ"]],
	PHI: [[1933, 9999, "PHI"]],
	PIT: [[1933, 9999, "PIT"]],
	SEA: [[1976, 9999, "SEA"]],
	SF: [[1950, 9999, "SF"]],
	SFO: [[1950, 9999, "SF"]],
	TB: [[1976, 9999, "TB"]],
	TAM: [[1976, 9999, "TB"]],
	WAS: [[1937, 9999, "WSH"]],
}

export function nflFranchiseTeam(code: string, season: number): string | null {
	const ranges = NFL_RANGES[code]
	if (!ranges) return null
	for (const [from, to, team] of ranges) {
		if (season >= from && season <= to) return team
	}
	return null
}

export type LeagueTeams = {
	leagueId: string
	// Our team row by abbreviation.
	byAbbreviation: Map<string, { id: string; name: string }>
}

// Our teams for one league, keyed the way the maps above name them.
export async function loadLeagueTeams(
	league: HistoryLeague,
): Promise<LeagueTeams> {
	const leagueRow = await db.query.leagues.findFirst({
		where: { slug: league },
	})
	if (!leagueRow) throw new Error(`No ${league} league row`)
	const rows = await db
		.select({
			id: teams.id,
			name: teams.name,
			abbreviation: teams.abbreviation,
		})
		.from(teams)
		.where(eq(teams.leagueId, leagueRow.id))
	return {
		leagueId: leagueRow.id,
		byAbbreviation: new Map(
			rows.map((row) => [row.abbreviation, { id: row.id, name: row.name }]),
		),
	}
}

// Every abbreviation a league's map can produce, for checking a map against
// the teams table.
export function mappedAbbreviations(league: HistoryLeague): string[] {
	const values = match(league)
		.with("nba", () => Object.values(NBA_FRANCHISES))
		.with("mlb", () => Object.values(MLB_FRANCHISES))
		.with("nhl", () => Object.values(NHL_FRANCHISES))
		.with("nfl", () =>
			Object.values(NFL_RANGES).flatMap((ranges) =>
				ranges.map(([, , team]) => team),
			),
		)
		.exhaustive()
	return [...new Set(values)]
}
