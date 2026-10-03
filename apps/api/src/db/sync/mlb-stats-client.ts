// Thin wrappers over MLB's own public, unauthenticated Stats API. Used for
// rookie eligibility (see mlb-rookie-eligibility.ts) - ESPN's roster feed
// (espn-client.ts) has no cumulative career stats, and this is MLB's own
// data, which is the authoritative source for something MLB itself
// administers (Rookie of the Year) - and for the MLB ids its CDN keys
// headshots and logos by (see league-images.ts). No key needed, no official
// support either - if a shape here breaks, that's MLB, not us.
const BASE_URL = "https://statsapi.mlb.com/api/v1"

// sportId 1 is MLB itself in MLB's own sport taxonomy (2 is AAA, etc.) -
// every request below is scoped to it so a same-named minor-league team or
// person never leaks in.
const MLB_SPORT_ID = 1

export type MlbTeam = {
	id: number
	// Matched against ESPN's own team displayName rather than against
	// abbreviations: all 30 teams agree on the full name, while the two
	// feeds disagree on two abbreviations (ESPN's ARI/CHW vs MLB's AZ/CWS),
	// and a team that fails to resolve takes its whole roster's eligibility
	// with it.
	name: string
}

// One season's worth of hitting or pitching totals, under whichever group it
// came back in. Both groups carry an `atBats` field and they mean opposite
// things - in a hitting split it is the player's own at-bats, in a pitching
// split it is at-bats against him - so a split is only ever read through the
// group that produced it (see mlb-rookie-eligibility.ts).
export type MlbSeasonStat = {
	season: string // e.g. "2025" - MLB's own season labels are plain calendar years
	stat: {
		atBats?: number
		// MLB's own notation: the digit after the decimal point is thirds of an
		// inning (.1 = ⅓, .2 = ⅔), not a decimal fraction - e.g. "12.1" means 12⅓
		// innings, not 12.1 innings. Parsed in mlb-rookie-eligibility.ts.
		inningsPitched?: string
	}
}

export type MlbStatGroup = {
	group: { displayName: "hitting" | "pitching" | (string & {}) }
	splits: MlbSeasonStat[]
}

export type MlbRosterEntry = {
	person: {
		id: number
		fullName: string
		// Absent for someone who has never appeared in an MLB game at all -
		// a 40-man roster spot alone doesn't create a stat line.
		stats?: MlbStatGroup[]
	}
}

async function mlbGet<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE_URL}/${path}`)
	if (!res.ok) {
		throw new Error(`MLB Stats API request failed: ${path} (${res.status})`)
	}
	return res.json() as Promise<T>
}

export async function fetchAllMlbTeams(): Promise<MlbTeam[]> {
	const data = await mlbGet<{ teams: MlbTeam[] }>(
		`teams?sportId=${MLB_SPORT_ID}`,
	)
	return data.teams
}

// rosterType=40Man, NOT the bare endpoint's default (the 26-man day-of
// ACTIVE roster only) - verified live: the plain endpoint for the Athletics
// (team 133) returned 26 names and was missing real rostered players like
// Jacob Wilson and Gunnar Hoglund entirely, while ?rosterType=40Man included
// them. ESPN's own roster sync (espn-client.ts's fetchRoster) is similarly
// broader than just the active 26 - matching against the narrower default
// here would silently fail to find almost every low-experience/recently-
// optioned player, which is exactly the population this lookup exists for.
//
// The hydrate pulls each person's full year-by-year career line in with the
// roster, so one request per team answers eligibility for that team's whole
// roster - the alternative is a career-stats request per player, ~840 of
// them across the league every sync.
export async function fetchMlbTeamRoster(
	mlbTeamId: number,
): Promise<MlbRosterEntry[]> {
	const hydrate = encodeURIComponent(
		`person(stats(type=yearByYear,group=[hitting,pitching],sportId=${MLB_SPORT_ID}))`,
	)
	const data = await mlbGet<{ roster: MlbRosterEntry[] }>(
		`teams/${mlbTeamId}/roster?rosterType=40Man&hydrate=${hydrate}`,
	)
	return data.roster
}
