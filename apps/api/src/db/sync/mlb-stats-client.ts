// Thin wrappers over MLB's own public, unauthenticated Stats API. Used only
// for rookie eligibility (see mlb-rookie-eligibility.ts) - ESPN's roster feed
// (espn-client.ts) has no cumulative career stats, and this is MLB's own
// data, which is the authoritative source for something MLB itself
// administers (Rookie of the Year). No key needed, no official support
// either - if a shape here breaks, that's MLB, not us.
const BASE_URL = "https://statsapi.mlb.com/api/v1"

// sportId 1 is MLB itself in MLB's own sport taxonomy (2 is AAA, etc.) -
// every request below is scoped to it so a same-named minor-league team or
// person never leaks in.
const MLB_SPORT_ID = 1

export type MlbTeam = {
	id: number
	abbreviation: string
}

export type MlbRosterEntry = {
	person: { id: number; fullName: string }
}

// One season's worth of hitting or pitching totals. atBats only appears on
// hitting splits, inningsPitched only on pitching splits - a given season row
// is one or the other depending on which `group` it came from, never both.
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
export async function fetchMlbTeamRoster(
	mlbTeamId: number,
): Promise<MlbRosterEntry[]> {
	const data = await mlbGet<{ roster: MlbRosterEntry[] }>(
		`teams/${mlbTeamId}/roster?rosterType=40Man`,
	)
	return data.roster
}

// yearByYear covers every season a person has ever appeared in, hitting and
// pitching together (a two-way player gets both) - exactly what's needed to
// sum career-to-date at-bats/innings-pitched in mlb-rookie-eligibility.ts.
export async function fetchMlbCareerStats(
	personId: number,
): Promise<MlbSeasonStat[]> {
	const data = await mlbGet<{ stats: { splits: MlbSeasonStat[] }[] }>(
		`people/${personId}/stats?stats=yearByYear&group=hitting,pitching&sportId=${MLB_SPORT_ID}`,
	)
	return data.stats.flatMap((s) => s.splits)
}
