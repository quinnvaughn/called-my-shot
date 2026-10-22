import { DAY_MS } from "../../lib/time"

// Thin wrappers over ESPN's public, unauthenticated site API. No key needed,
// no official support either - if a shape here breaks, that's ESPN, not us.
const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports"

export type EspnSportPath =
	| "basketball/nba"
	| "football/nfl"
	| "baseball/mlb"
	| "hockey/nhl"

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
	// `abbreviation` is what isOnRoster reads. `type` is the stable slug
	// behind it ("active", "injured60", "15-day-il"), which athleteInjuryStatus
	// in sync-players.ts reads for the IL stints ESPN files no `injuries`
	// record for, and `name` is that slug's display form ("Injured/60").
	status?: { abbreviation: string; type?: string; name?: string }
	// The same shape, and the same designation vocabulary ("Questionable",
	// "Out", "Injured Reserve", "60-Day-IL"), that depth charts carry - see
	// EspnDepthChartAthlete. Absent for a healthy player.
	injuries?: { status: string }[]
	// Whole seasons of experience, 0 for a rookie. Missing on the rare roster
	// entry ESPN hasn't backfilled it for.
	experience?: { years: number }
	// ESPN's own headshot. Only read for the NFL, whose league CDN keys its
	// photos by an opaque image id rather than a player id - see
	// db/sync/league-images.ts.
	headshot?: { href: string }
}

// ESPN's own status vocabulary. `name` is open-ended: a game in progress is
// not always STATUS_IN_PROGRESS - verified live on an NFL Sunday, games at the
// half read STATUS_HALFTIME. `state` is the coarse phase every name maps onto
// ("pre" before kickoff, "in" while the game is underway including breaks,
// "post" once it's over or called off), which is what toGameStatus in
// sync-games.ts reads.
export type EspnEventStatus = {
	type: {
		name:
			| "STATUS_SCHEDULED"
			| "STATUS_IN_PROGRESS"
			| "STATUS_HALFTIME"
			| "STATUS_END_PERIOD"
			| "STATUS_FINAL"
			| "STATUS_POSTPONED"
			| (string & {})
		state: "pre" | "in" | "post" | (string & {})
		completed: boolean
		// "Final", "Final/OT", "Final/SO" - how a finished game ended.
		detail?: string
		// The same, shortened, and where a live game is: "Top 7th", "6:11 -
		// 4th", "Halftime".
		shortDetail?: string
	}
	// The quarter, period or inning, and the seconds left in it. A baseball
	// clock is always 0.
	period?: number
	clock?: number
}

// A competitor's record entries, one per split ("total", or "ytd" in the NHL,
// is the one this app cares about - overall W-L(-T), same number a broadcast
// graphic would show - "home"/"road" are ESPN splits this app doesn't
// surface). displayValue is a plain "W-L" or "W-L-T" string, or the NHL's
// "W-L-OTL, N PTS" - parsed, not derived, since this app has no independent
// source of truth for a team's record.
export type EspnRecord = {
	type: "total" | "ytd" | "home" | "road" | (string & {})
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
	// False while the date is a placeholder rather than a real start time -
	// an "If Necessary" postseason game before it's scheduled, for one.
	timeValid?: boolean
	competitions: [
		{
			// Absent on some historical/edge events per ESPN, hence optional -
			// treated as "nothing to capture" rather than an error.
			venue?: { fullName: string }
			// A postseason game's round and place in its series ("NLDS - Game
			// 4", "First Round - Game 3 If Necessary"). See parsePostseasonNote.
			notes?: { headline?: string }[]
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

// Carries the HTTP status so a caller can tell ESPN refusing us (403/429) apart
// from an ordinary failed request - see sync-game-starters.ts, which stops a
// run on the former.
export class EspnRequestError extends Error {
	readonly status: number

	constructor(path: string, status: number) {
		super(`ESPN request failed: ${path} (${status})`)
		this.status = status
	}
}

// Without a timeout one hung response holds its job, and the job's lease, open
// indefinitely.
const REQUEST_TIMEOUT_MS = 10_000

async function espnGet<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE_URL}/${path}`, {
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
	if (!res.ok) {
		throw new EspnRequestError(path, res.status)
	}
	return res.json() as Promise<T>
}

async function fetchTeams(sportPath: EspnSportPath): Promise<EspnTeam[]> {
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

async function fetchGroups(sportPath: EspnSportPath): Promise<EspnGroup[]> {
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

async function fetchRoster(
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

async function fetchSchedule(
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
			// Baseball only: the outs in the current half-inning.
			situation?: { outs?: number }
		},
	]
}

async function fetchScoreboard(
	sportPath: EspnSportPath,
): Promise<EspnScoreboardEvent[]> {
	const data = await espnGet<{ events: EspnScoreboardEvent[] }>(
		`${sportPath}/scoreboard`,
	)
	return data.events
}

export type EspnStatistic = { abbreviation: string; displayValue: string }

// MLB and NHL only in practice: no other league's scoreboard carries
// probables (verified live). `abbreviation` is "SP" for the probable starting
// pitcher, "SG" for the NHL's probable starting goalie.
export type EspnProbable = {
	name: string
	abbreviation: string
	athlete: { id: string; displayName: string }
	statistics?: EspnStatistic[]
}

export type EspnProbablesEvent = {
	id: string
	competitions: [
		{
			competitors: {
				homeAway: "home" | "away"
				team: { id: string }
				probables?: EspnProbable[]
			}[]
		},
	]
}

// Every game from startDate through endDate (YYYYMMDD, ESPN's local US
// calendar dates), one call per day: the scoreboard answers a "dates=A-B"
// range with a 400 (see fetchPostseasonDay), while a single date still works.
// The ranges asked for here are a few days at most.
async function fetchScoreboardRange(
	sportPath: EspnSportPath,
	startDate: string,
	endDate: string,
): Promise<EspnProbablesEvent[]> {
	const events: EspnProbablesEvent[] = []
	for (const date of espnDatesBetween(startDate, endDate)) {
		const data = await espnGet<{ events: EspnProbablesEvent[] }>(
			`${sportPath}/scoreboard?dates=${date}&limit=200`,
		)
		events.push(...data.events)
	}
	return events
}

// Each YYYYMMDD from start through end, inclusive. Plain calendar arithmetic
// in UTC, which only ever steps whole days, so no time zone can skip or repeat
// one.
export function espnDatesBetween(startDate: string, endDate: string): string[] {
	const toDate = (yyyymmdd: string) =>
		new Date(
			Date.UTC(
				Number(yyyymmdd.slice(0, 4)),
				Number(yyyymmdd.slice(4, 6)) - 1,
				Number(yyyymmdd.slice(6, 8)),
			),
		)
	const dates: string[] = []
	const end = toDate(endDate)
	for (let day = toDate(startDate); day <= end; ) {
		dates.push(day.toISOString().slice(0, 10).replaceAll("-", ""))
		day = new Date(day.getTime() + DAY_MS)
	}
	return dates
}

// A postseason game. `notes` names its round ("NBA Finals - Game 7", "AFC
// Championship") and `series` is only present for the leagues that play
// series.
export type EspnPostseasonEvent = {
	id: string
	date: string
	competitions: [
		{
			notes?: { headline?: string }[]
			// totalCompetitions is the series' length (5 for a best-of-5) - the
			// team schedule endpoint the daily sync reads doesn't carry it.
			series?: { completed: boolean; totalCompetitions?: number }
			status: { type: { name: string; completed: boolean } }
			competitors: { team: { id: string }; winner?: boolean }[]
		},
	]
}

// Every postseason game in a date range (YYYYMMDD). A whole NBA postseason is
// under 200 games, so one call covers it.
async function fetchPostseasonScoreboard(
	sportPath: EspnSportPath,
	startDate: string,
	endDate: string,
): Promise<EspnPostseasonEvent[]> {
	const data = await espnGet<{ events: EspnPostseasonEvent[] }>(
		`${sportPath}/scoreboard?seasontype=3&dates=${startDate}-${endDate}&limit=500`,
	)
	return data.events
}

// One ET calendar day's postseason games (YYYYMMDD). A single day rather than
// a range: the scoreboard answers every "dates=A-B" range with a 400 (verified
// live across MLB, NBA and WNBA, 2026-09-25), while a single date still works.
async function fetchPostseasonDay(
	sportPath: EspnSportPath,
	date: string,
): Promise<EspnPostseasonEvent[]> {
	const data = await espnGet<{ events: EspnPostseasonEvent[] }>(
		`${sportPath}/scoreboard?seasontype=3&dates=${date}&limit=200`,
	)
	return data.events
}

export type EspnLineupEntry = {
	starter?: boolean
	batOrder?: number
	position?: { abbreviation: string }
	athlete: { id: string; displayName: string }
}

// Before a lineup is posted the team is still listed, just with an empty (or
// missing) roster - verified live on an MLB game a few hours out.
export type EspnSummaryRoster = {
	homeAway: "home" | "away"
	team: { id: string }
	roster?: EspnLineupEntry[]
}

async function fetchGameSummaryRosters(
	sportPath: EspnSportPath,
	espnEventId: string,
): Promise<EspnSummaryRoster[]> {
	const data = await espnGet<{ rosters?: EspnSummaryRoster[] }>(
		`${sportPath}/summary?event=${espnEventId}`,
	)
	return data.rosters ?? []
}

export type EspnBoxScoreAthlete = {
	athlete: { id: string; displayName?: string }
	// NBA only: set on anyone listed for the game who sat.
	didNotPlay?: boolean
	// MLB: false once a player has been taken out of the game in this table's
	// role, a pitcher relieved or a batter pinch-hit or run for.
	active?: boolean
	// Lines up with the table's `keys`.
	stats: string[]
	// MLB pitchers carry their decision here ("W, 2-3", "S, 33").
	notes?: { type: string; text: string }[]
}

// One stat table for one team. NBA has a single unnamed table, NFL names each
// ("passing", "defensive"), MLB types them ("batting", "pitching"), NHL names
// them by position ("forwards", "defenses", "goalies"). `totals` is the
// team's sum of each column, which the NHL leaves out. A table nobody recorded anything in (no
// interceptions) still lists its keys, but with no athletes and no totals.
export type EspnBoxScorePlayerTable = {
	name?: string | null
	type?: string | null
	keys: string[]
	totals?: string[]
	athletes: EspnBoxScoreAthlete[]
}

export type EspnBoxScoreTeamStat = {
	name: string
	displayValue: string
	value?: number
}

// MLB groups its team stats by batting/pitching; NBA and NFL list them flat.
export type EspnBoxScoreTeamStatGroup = {
	name: string
	stats: EspnBoxScoreTeamStat[]
}

// The parts of a game's summary the automatic resolver reads - see
// box-score-parse.ts. Verified live against a final game in each league.
export type EspnGameSummary = {
	header: {
		competitions: [
			{
				status: EspnEventStatus
				boxscoreAvailable?: boolean
				boxscoreSource?: string
				competitors: {
					id: string
					homeAway: "home" | "away"
					score?: string
					// One entry per period played, a shootout included as its own
					// "period" (1 for the team that won it, 0 for the other).
					linescores?: { displayValue: string }[]
				}[]
			},
		]
	}
	// Play-by-play, which only MLB's box score is read from: see
	// deriveTotalBases in box-score-parse.ts.
	plays?: {
		type?: { text?: string }
		atBatId?: string
		participants?: { athlete: { id: string }; type: string }[]
	}[]
	boxscore?: {
		players?: {
			team: { id: string }
			statistics: EspnBoxScorePlayerTable[]
		}[]
		teams?: {
			team: { id: string }
			statistics: (EspnBoxScoreTeamStat | EspnBoxScoreTeamStatGroup)[]
		}[]
	}
}

async function fetchGameSummary(
	sportPath: EspnSportPath,
	espnEventId: string,
): Promise<EspnGameSummary> {
	return espnGet<EspnGameSummary>(`${sportPath}/summary?event=${espnEventId}`)
}

export type EspnDepthChartAthlete = {
	id: string
	displayName: string
	injuries?: { status: string }[]
}

export type EspnDepthChartPosition = {
	position: { abbreviation: string }
	// Ordered by depth - athletes[0] is the first-string player.
	athletes: EspnDepthChartAthlete[]
}

// Keyed by ESPN's lowercase position slot ("qb", "wr1", "lde", "pg"), in the
// order ESPN lists them.
export type EspnDepthChart = {
	name: string
	positions: Record<string, EspnDepthChartPosition>
}

// NFL returns three charts (offense, defense, special teams), NBA one - both
// verified live. Works any time of year, not only near a game.
async function fetchDepthChart(
	sportPath: EspnSportPath,
	espnTeamId: string,
): Promise<EspnDepthChart[]> {
	const data = await espnGet<{ depthchart?: EspnDepthChart[] }>(
		`${sportPath}/teams/${espnTeamId}/depthcharts`,
	)
	return data.depthchart ?? []
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

// For per-game reads a job has to tell apart: null only when ESPN has nothing
// at that address, and a thrown EspnRequestError for any other failure, so a
// refusal still ends the run (see espn-requester.ts).
async function coreEspnGetOrNotFound<T>(path: string): Promise<T | null> {
	const res = await fetch(`${CORE_BASE_URL}/${path}`, {
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
	if (res.status === 404) return null
	if (!res.ok) throw new EspnRequestError(path, res.status)
	return res.json() as Promise<T>
}

function competitorPath(
	sportPath: EspnSportPath,
	espnEventId: string,
	espnTeamId: string,
): string {
	return `${toLeaguesPath(sportPath)}/events/${espnEventId}/competitions/${espnEventId}/competitors/${espnTeamId}`
}

// Everyone on one team's game roster. The site box score leaves an NFL player
// out of every table they recorded nothing in, so this is what tells "played,
// did nothing" apart from "didn't play".
export type EspnCompetitorRosterEntry = {
	playerId: number
	didNotPlay?: boolean
}

async function fetchCompetitorRoster(
	sportPath: EspnSportPath,
	espnEventId: string,
	espnTeamId: string,
): Promise<EspnCompetitorRosterEntry[] | null> {
	const data = await coreEspnGetOrNotFound<{
		entries?: EspnCompetitorRosterEntry[]
	}>(`${competitorPath(sportPath, espnEventId, espnTeamId)}/roster`)
	return data ? (data.entries ?? []) : null
}

// One athlete's stats for one game, as game values. The site box score's MLB
// avg/onBasePct/slugAvg columns are season-to-date and it has no stolen bases
// column, which is why those come from here instead.
export type EspnAthleteGameStatistics = {
	splits: {
		categories: { name: string; stats: { name: string; value: number }[] }[]
	}
}

async function fetchCompetitorAthleteStatistics(
	sportPath: EspnSportPath,
	espnEventId: string,
	espnTeamId: string,
	espnAthleteId: string,
): Promise<EspnAthleteGameStatistics | null> {
	return coreEspnGetOrNotFound<EspnAthleteGameStatistics>(
		`${competitorPath(sportPath, espnEventId, espnTeamId)}/roster/${espnAthleteId}/statistics/0`,
	)
}

export type EspnSeason = {
	year: number
	displayName: string
}

async function fetchSeason(
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

async function fetchSeasonType(
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
// this app treats as authoritative (see seasonWeeks in db/schema/games.ts).
// The list endpoint hands back `$ref` URLs rather than the week objects
// themselves, so each week is fetched by number - verified live, the refs
// are always 1..count with no gaps (NFL 2026 regular season: 18; a
// postseason: 5, wild card through the Super Bowl). A week that 404s is
// skipped rather than throwing, same as every other core-API read here.
async function fetchSeasonWeeks(
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

// Same categorized shape as a game's athlete statistics, for a whole regular
// season. `perGameValue` is left out on purpose: ESPN rounds it to a whole
// number, so a per-game line is worked out from the total instead.
export type EspnSeasonStatistics = EspnAthleteGameStatistics

async function fetchAthleteSeasonStatistics(
	sportPath: EspnSportPath,
	year: number,
	espnAthleteId: string,
): Promise<EspnSeasonStatistics | null> {
	return coreEspnGetOrNotFound<EspnSeasonStatistics>(
		`${toLeaguesPath(sportPath)}/seasons/${year}/types/2/athletes/${espnAthleteId}/statistics`,
	)
}

async function fetchTeamSeasonStatistics(
	sportPath: EspnSportPath,
	year: number,
	espnTeamId: string,
): Promise<EspnSeasonStatistics | null> {
	return coreEspnGetOrNotFound<EspnSeasonStatistics>(
		`${toLeaguesPath(sportPath)}/seasons/${year}/types/2/teams/${espnTeamId}/statistics`,
	)
}

const STANDINGS_BASE_URL = "https://site.api.espn.com/apis/v2/sports"

// displayValue alongside value because the two carry different things in the
// same array: the record splits ("Home", "Road", "Last Ten Games") arrive as a
// displayValue of "31-9" with no numeric value at all, while the scoring stats
// arrive as numbers. A reader that only looked at value would silently drop
// every split.
export type EspnStandingsEntry = {
	// displayName is the team's name in the season asked for ("Houston
	// Oilers"), and on old seasons can carry runs of padding spaces.
	team: { id: string; displayName?: string }
	stats: { name: string; value?: number; displayValue?: string }[]
}

// Conferences, then divisions - a league's standings nest to whatever depth
// it groups teams by, with entries at the leaves.
export type EspnStandingsGroup = {
	// The season's own name for the group ("AFC Central"), not today's.
	name?: string
	// `season` is the year the table is for. Asked for a year it has no
	// standings for, ESPN answers with the current season's instead.
	standings?: { season?: number; entries: EspnStandingsEntry[] }
	children?: EspnStandingsGroup[]
}

// Always asked for by season: without one ESPN answers with whichever season it
// considers current, which between seasons is next year's empty preseason.
// leagueWide asks for one league-wide table (level=1) instead of ESPN's
// default split by conference - see SyncLeagueConfig.seedsLeagueWide.
// divisions asks for the deepest split instead (level=3): conferences, then
// divisions, by the names they had that season. The NHL answers it with
// conferences only.
async function fetchStandings(
	sportPath: EspnSportPath,
	year: number,
	{
		leagueWide = false,
		divisions = false,
	}: { leagueWide?: boolean; divisions?: boolean } = {},
): Promise<EspnStandingsGroup> {
	const level = leagueWide ? "&level=1" : divisions ? "&level=3" : ""
	const path = `${sportPath}/standings?season=${year}${level}`
	const res = await fetch(`${STANDINGS_BASE_URL}/${path}`, {
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
	if (!res.ok) throw new EspnRequestError(path, res.status)
	return res.json() as Promise<EspnStandingsGroup>
}

// One team's leaders in each stat category over a regular season. Each
// category's first leader is the team's best; the athlete is a $ref to
// resolve with fetchCoreAthlete.
export type EspnTeamLeaders = {
	categories: {
		name: string
		leaders: { displayValue: string; athlete?: { $ref: string } }[]
	}[]
}

async function fetchTeamLeaders(
	sportPath: EspnSportPath,
	year: number,
	espnTeamId: string,
): Promise<EspnTeamLeaders | null> {
	return coreEspnGetOrNotFound<EspnTeamLeaders>(
		`${toLeaguesPath(sportPath)}/seasons/${year}/types/2/teams/${espnTeamId}/leaders`,
	)
}

export type EspnCoreAthlete = { displayName: string }

// An athlete by the core API $ref a leader carries. They come as http://
// links, which are fetched over https.
async function fetchCoreAthlete(ref: string): Promise<EspnCoreAthlete | null> {
	const url = ref.replace(/^http:/, "https:")
	const res = await fetch(url, {
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
	if (res.status === 404) return null
	if (!res.ok) throw new EspnRequestError(url, res.status)
	return res.json() as Promise<EspnCoreAthlete>
}

// A finished postseason game from one team's schedule. Empty for a team
// that missed the playoffs.
export type EspnTeamPostseasonEvent = {
	id: string
	date: string
	competitions: [
		{
			competitors: { team: { id: string }; winner?: boolean }[]
		},
	]
}

// `served` is the season ESPN actually answered with, which it only says
// when there are games. For older seasons it isn't the one asked for:
// verified live, the NBA's season=1988 serves the 1989 postseason while
// season=1995 serves 1995's. See archiveLeagueSeason.
export type EspnTeamPostseason = {
	events: EspnTeamPostseasonEvent[]
	served: number | null
}

async function fetchTeamPostseason(
	sportPath: EspnSportPath,
	season: number,
	espnTeamId: string,
): Promise<EspnTeamPostseason> {
	const data = await espnGet<{
		events?: EspnTeamPostseasonEvent[]
		requestedSeason?: { year: number }
	}>(`${sportPath}/teams/${espnTeamId}/schedule?season=${season}&seasontype=3`)
	return {
		events: data.events ?? [],
		served: data.requestedSeason?.year ?? null,
	}
}

// Every ESPN read a job makes, as one object so a job can be handed a fake in
// place of the network. Jobs default to this one.
export const defaultEspnClient = {
	fetchTeams,
	fetchGroups,
	fetchRoster,
	fetchSchedule,
	fetchScoreboard,
	fetchScoreboardRange,
	fetchPostseasonScoreboard,
	fetchPostseasonDay,
	fetchGameSummaryRosters,
	fetchGameSummary,
	fetchDepthChart,
	fetchCompetitorRoster,
	fetchCompetitorAthleteStatistics,
	fetchSeason,
	fetchSeasonType,
	fetchSeasonWeeks,
	fetchAthleteSeasonStatistics,
	fetchTeamSeasonStatistics,
	fetchStandings,
	fetchTeamLeaders,
	fetchCoreAthlete,
	fetchTeamPostseason,
}

export type EspnClient = typeof defaultEspnClient
