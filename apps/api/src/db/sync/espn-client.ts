// Thin wrappers over ESPN's public, unauthenticated site API. No key needed,
// no official support either - if a shape here breaks, that's ESPN, not us.
const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports"

export type EspnSportPath = "basketball/nba" | "football/nfl" | "baseball/mlb"

export type EspnTeam = {
	id: string
	abbreviation: string
	displayName: string
	color: string
}

export type EspnAthlete = {
	id: string
	fullName: string
	position?: { abbreviation: string }
	status?: { abbreviation: string }
}

export type EspnEvent = {
	id: string
	date: string
	seasonType: { type: number }
	competitions: [
		{
			competitors: [
				{ homeAway: "home" | "away"; team: { id: string } },
				{ homeAway: "home" | "away"; team: { id: string } },
			]
		},
	]
}

async function espnGet<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE_URL}/${path}`)
	if (!res.ok) {
		throw new Error(`ESPN request failed: ${path} (${res.status})`)
	}
	return res.json() as Promise<T>
}

export async function fetchTeams(sportPath: EspnSportPath): Promise<EspnTeam[]> {
	const data = await espnGet<{
		sports: [{ leagues: [{ teams: { team: EspnTeam }[] }] }]
	}>(`${sportPath}/teams?limit=200`)
	return data.sports[0].leagues[0].teams.map((t) => t.team)
}

// The plain .../teams/{id}/roster endpoint only returns the 26-man ACTIVE
// roster (NBA/NFL/MLB alike) - anyone on the injured list drops off it
// entirely, not just out of the active lineup, which silently makes an
// injured star unfindable in the app the moment they go on the IL. team
// detail with ?enable=roster returns the fuller roster instead (its
// `athletes` is already a flat array for every sport, unlike the grouped-by-
// position shape .../roster uses for some leagues), each entry carrying a
// status.abbreviation that distinguishes "genuinely not on this team's
// active organization" (a call-up/farm-system player, a non-roster spring
// invite) from every real reason a rostered player might be sidelined
// (day-to-day, any IL stint) - only the former should ever be excluded.
const NON_ROSTER_STATUSES = ["minors", "non-roster"]

function isOnRoster(athlete: EspnAthlete): boolean {
	const status = athlete.status?.abbreviation.toLowerCase()
	if (!status) return true
	return !NON_ROSTER_STATUSES.some((excluded) => status.includes(excluded))
}

export async function fetchRoster(
	sportPath: EspnSportPath,
	espnTeamId: string,
): Promise<EspnAthlete[]> {
	const data = await espnGet<{ team: { athletes: EspnAthlete[] } }>(
		`${sportPath}/teams/${espnTeamId}?enable=roster`,
	)
	return data.team.athletes.filter(isOnRoster)
}

// Regular season (2) and postseason (3) only - preseason (1) games are noise
// for a prediction app (bench-heavy, don't reflect the real season). The
// endpoint won't just hand back "the season" without a seasontype filter -
// unfiltered, it defaults to whichever slate is temporally next (preseason,
// most of the year), even though the full regular season is already posted
// well before it starts. Postseason returns empty outside of playoffs, which
// is correct, not an error - it fills in once ESPN sets the bracket.
const SYNCED_SEASON_TYPES = [2, 3]

export async function fetchSchedule(
	sportPath: EspnSportPath,
	espnTeamId: string,
): Promise<EspnEvent[]> {
	const results = await Promise.all(
		SYNCED_SEASON_TYPES.map((seasonType) =>
			espnGet<{ events: EspnEvent[] }>(
				`${sportPath}/teams/${espnTeamId}/schedule?seasontype=${seasonType}`,
			),
		),
	)
	return results.flatMap((r) => r.events)
}

// Season boundary dates live on a different ESPN host entirely (the "core"
// API, not the "site" API everything above wraps) - verified live: e.g.
// sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026
// returns { year: 2026, displayName: "2025-26", ... }, and .../types/2 /
// .../types/3 give the regular-season/postseason startDate+endDate.
const CORE_BASE_URL = "https://sports.core.api.espn.com/v2/sports"

// "basketball/nba" -> "basketball/leagues/nba" - the core API nests league
// under an explicit /leagues/ segment the site API doesn't use.
function toLeaguesPath(sportPath: EspnSportPath): string {
	const [sport, league] = sportPath.split("/")
	return `${sport}/leagues/${league}`
}

// Returns null on a non-ok response rather than throwing, unlike espnGet
// above - an unpublished future postseason (or a season ESPN hasn't set up
// yet) is an expected, non-error case here, unlike a failed teams/roster/
// schedule fetch.
async function coreEspnGet<T>(path: string): Promise<T | null> {
	const res = await fetch(`${CORE_BASE_URL}/${path}`)
	if (!res.ok) return null
	return res.json() as Promise<T>
}

export type EspnSeason = {
	year: number
	displayName: string
}

export async function fetchSeason(
	sportPath: EspnSportPath,
	year: number,
): Promise<EspnSeason | null> {
	return coreEspnGet<EspnSeason>(`${toLeaguesPath(sportPath)}/seasons/${year}`)
}

export type EspnSeasonType = {
	type: number
	startDate: string
	endDate: string
}

export async function fetchSeasonType(
	sportPath: EspnSportPath,
	year: number,
	type: 2 | 3,
): Promise<EspnSeasonType | null> {
	return coreEspnGet<EspnSeasonType>(
		`${toLeaguesPath(sportPath)}/seasons/${year}/types/${type}`,
	)
}
