// Thin wrappers over ESPN's public, unauthenticated site API. No key needed,
// no official support either - if a shape here breaks, that's ESPN, not us.
const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports"

export type EspnSportPath = "basketball/nba" | "football/nfl"

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

// NBA's roster response is a flat athletes array. NFL's groups athletes by
// position instead ({ position: "offense", items: [athlete, ...] }), with no
// bare athlete objects at the top level at all - flatten both shapes here so
// callers only ever see a flat athlete list either way.
type EspnRosterEntry = EspnAthlete | { position?: string; items?: EspnAthlete[] }

function isRosterGroup(
	entry: EspnRosterEntry,
): entry is { position?: string; items?: EspnAthlete[] } {
	return "items" in entry
}

export async function fetchRoster(
	sportPath: EspnSportPath,
	espnTeamId: string,
): Promise<EspnAthlete[]> {
	const data = await espnGet<{ athletes: EspnRosterEntry[] }>(
		`${sportPath}/teams/${espnTeamId}/roster`,
	)
	return data.athletes.flatMap((entry) =>
		isRosterGroup(entry) ? (entry.items ?? []) : [entry],
	)
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
