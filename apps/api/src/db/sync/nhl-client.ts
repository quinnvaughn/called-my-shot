// The NHL's own public, unauthenticated web API, for the team abbreviations
// its CDN keys logos by and the headshot URLs its rosters carry (see
// league-images.ts).
const BASE_URL = "https://api-web.nhle.com/v1"

export type NhlTeam = {
	// Matches ESPN's team displayName once diacritics are folded
	// ("Montréal Canadiens") - verified live for all 32.
	teamName: { default: string }
	teamAbbrev: { default: string }
	// The NHL's own season id, e.g. 20262027.
	seasonId: number
}

export type NhlRosterPlayer = {
	id: number
	headshot: string
	firstName: { default: string }
	lastName: { default: string }
}

async function nhlGet<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE_URL}/${path}`)
	if (!res.ok) {
		throw new Error(`NHL API request failed: ${path} (${res.status})`)
	}
	return res.json() as Promise<T>
}

// The standings are the one endpoint that lists every team by name and
// abbreviation. "now" redirects to the latest dated standings, which fetch follows.
export async function fetchNhlTeams(): Promise<NhlTeam[]> {
	const data = await nhlGet<{ standings: NhlTeam[] }>("standings/now")
	return data.standings
}

// season is "current" or a season id like 20252026.
export async function fetchNhlRoster(
	teamAbbrev: string,
	season: "current" | number,
): Promise<NhlRosterPlayer[]> {
	const data = await nhlGet<{
		forwards: NhlRosterPlayer[]
		defensemen: NhlRosterPlayer[]
		goalies: NhlRosterPlayer[]
	}>(`roster/${teamAbbrev}/${season}`)
	return [...data.forwards, ...data.defensemen, ...data.goalies]
}
