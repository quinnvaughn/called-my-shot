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
	// Every position ESPN considers this athlete eligible at, not just their
	// current/primary tag above - e.g. a 1B/DH bat carries both "1B" and "DH"
	// here even when `position` itself reads "DH". Same `?enable=roster`
	// response as `position`, verified live - no separate endpoint needed.
	positions?: { abbreviation: string }[]
	status?: { abbreviation: string }
	// Whole seasons of experience, 0 for a rookie. Missing on the rare roster
	// entry ESPN hasn't backfilled it for.
	experience?: { years: number }
}

// ESPN's own status vocabulary - verified live against a real schedule
// response. STATUS_IN_PROGRESS is the documented value for a live game
// (not seen in the sample pulled, which had no in-progress game in it, but
// it's ESPN's standard live status across their site API). Anything else
// (weather delays, etc.) falls back to "scheduled" - see toGameStatus in
// sync-live-scores.ts.
export type EspnEventStatus = {
	type: {
		name:
			| "STATUS_SCHEDULED"
			| "STATUS_IN_PROGRESS"
			| "STATUS_FINAL"
			| "STATUS_POSTPONED"
			| (string & {})
		completed: boolean
	}
}

// A competitor's record entries, one per split ("total" is the one this app
// cares about - overall W-L(-T), same number a broadcast graphic would show
// - "home"/"road" are ESPN splits this app doesn't surface). displayValue is
// a plain "W-L" or "W-L-T" string - parsed, not derived, since this app has
// no independent source of truth for a team's record.
export type EspnRecord = {
	type: "total" | "home" | "road" | (string & {})
	displayValue: string
}

export type EspnEvent = {
	id: string
	date: string
	seasonType: { type: number }
	// NFL-only in practice (verified live against the site API) - ESPN's own
	// authoritative week number, never recomputed from dates on our side.
	// Absent for leagues with no week concept.
	week?: { number: number }
	competitions: [
		{
			// Absent on some historical/edge events per ESPN, hence optional -
			// treated as "nothing to capture" rather than an error.
			venue?: { fullName: string }
			status: EspnEventStatus
			competitors: [
				{
					homeAway: "home" | "away"
					team: { id: string }
					score?: { value: number; displayValue: string }
					record?: EspnRecord[]
				},
				{
					homeAway: "home" | "away"
					team: { id: string }
					score?: { value: number; displayValue: string }
					record?: EspnRecord[]
				},
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

export async function fetchTeams(
	sportPath: EspnSportPath,
): Promise<EspnTeam[]> {
	const data = await espnGet<{
		sports: [{ leagues: [{ teams: { team: EspnTeam }[] }] }]
	}>(`${sportPath}/teams?limit=200`)
	return data.sports[0].leagues[0].teams.map((t) => t.team)
}

// Conference/division tree - verified live against basketball/nba,
// football/nfl, and baseball/mlb: two levels, top-level groups are
// conferences, each with a `children` array of divisions, each division
// carrying its own `teams`. A league with conferences but no further split
// would have `teams` directly on the top-level group instead of `children` -
// not seen in the three leagues checked, handled defensively in sync-teams.ts
// anyway since this is unofficial and could vary by league.
export type EspnGroupTeam = { id: string }

export type EspnGroup = {
	name: string
	abbreviation: string
	teams?: EspnGroupTeam[]
	children?: EspnGroup[]
}

export async function fetchGroups(
	sportPath: EspnSportPath,
): Promise<EspnGroup[]> {
	const data = await espnGet<{ groups: EspnGroup[] }>(`${sportPath}/groups`)
	return data.groups
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

// The team-schedule endpoint above (fetchSchedule) never carries a live,
// in-progress score - verified live: its competitors[].score is simply
// absent from the JSON entirely while a game is in progress, and only shows
// up once the game goes final. The scoreboard endpoint is ESPN's actual live
// feed (what espn.com's own scoreboard/gamecast reads from) and DOES carry
// live scores - but shapes them differently: score comes back as a bare
// numeric string ("6"), not the {value, displayValue} object the schedule
// endpoint uses, hence the separate type here rather than reusing EspnEvent.
// No seasontype/date filtering - the default (unparameterized) call returns
// "today's" full slate for the league, which is all sync-live-scores.ts ever
// needs (it only polls games already known to be in-flight).
export type EspnScoreboardEvent = {
	id: string
	competitions: [
		{
			status: EspnEventStatus
			competitors: [
				{ homeAway: "home" | "away"; team: { id: string }; score?: string },
				{ homeAway: "home" | "away"; team: { id: string }; score?: string },
			]
		},
	]
}

export async function fetchScoreboard(
	sportPath: EspnSportPath,
): Promise<EspnScoreboardEvent[]> {
	const data = await espnGet<{ events: EspnScoreboardEvent[] }>(
		`${sportPath}/scoreboard`,
	)
	return data.events
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

export type EspnSeasonWeek = {
	number: number
	startDate: string
	endDate: string
}

// Every week ESPN publishes for one season type, with the week boundaries
// this app treats as authoritative (see seasonWeeks in db/schema/sports.ts).
// The list endpoint hands back `$ref` URLs rather than the week objects
// themselves, so each week is fetched by number - verified live, the refs
// are always 1..count with no gaps (NFL 2026 regular season: 18; a
// postseason: 5, wild card through the Super Bowl). A week that 404s is
// skipped rather than throwing, same as every other core-API read here.
export async function fetchSeasonWeeks(
	sportPath: EspnSportPath,
	year: number,
	type: 2 | 3,
): Promise<EspnSeasonWeek[]> {
	const basePath = `${toLeaguesPath(sportPath)}/seasons/${year}/types/${type}/weeks`
	const list = await coreEspnGet<{ count: number }>(`${basePath}?limit=100`)
	if (!list?.count) return []
	const weeks = await Promise.all(
		Array.from({ length: list.count }, (_, i) =>
			coreEspnGet<EspnSeasonWeek>(`${basePath}/${i + 1}`),
		),
	)
	return weeks.filter((week): week is EspnSeasonWeek => week !== null)
}
