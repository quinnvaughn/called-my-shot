import type { Team } from "../db/schema"

type Grouped = Pick<Team, "name" | "conference" | "division">

// Builds the heading a per-team ballot member sits under
// (ballotQuestions.section), scoped to one league's full team list because
// the right heading depends on the rest of the league.
//
// A division name stands on its own only when no other conference reuses it.
// "Atlantic" says everything on an NBA ballot, while "East" says nothing on
// an NFL one - both conferences have an East, and the qualified form is the
// real division name there anyway ("AFC East", "AL East"). So the conference
// prefix goes on exactly where it's needed, which lands on the actual
// real-world name in every league instead of a fabricated one.
//
// Null for a league with no split at all, which leaves that league's ballot
// ungrouped rather than giving every row an empty heading.
export function teamSectionResolver(
	teams: Grouped[],
): (team: Grouped) => string | null {
	const conferencesByDivision = new Map<string, Set<string>>()
	for (const team of teams) {
		if (!team.division || !team.conference) continue
		const conferences =
			conferencesByDivision.get(team.division) ?? new Set<string>()
		conferences.add(team.conference)
		conferencesByDivision.set(team.division, conferences)
	}
	return (team) => {
		if (!team.division) return team.conference ?? null
		const isShared = (conferencesByDivision.get(team.division)?.size ?? 0) > 1
		if (!isShared || !team.conference) return team.division
		return `${team.conference} ${team.division}`
	}
}

// Conference, then division, then team name - the order a per-team ballot
// lists its members in. Alphabetical on the division happens to produce the
// conventional order in every league here (AFC/NFC East-North-South-West,
// NBA East Atlantic-Central-Southeast and West Northwest-Pacific-Southwest),
// so no hand-maintained ordering table is needed. A team missing either
// field sorts last rather than salting an empty heading into the middle of
// the list.
// A missing value is ordered after every present one explicitly, rather than
// by standing in a high sentinel character for it: localeCompare orders
// punctuation ahead of letters, so a sentinel like "~" sorts such a team to
// the top of the list instead of the bottom.
function compareGroupingField(a: string | null, b: string | null): number {
	if (a === b) return 0
	if (!a) return 1
	if (!b) return -1
	return a.localeCompare(b)
}

export function compareTeamsByGrouping(a: Grouped, b: Grouped): number {
	const byConference = compareGroupingField(a.conference, b.conference)
	if (byConference !== 0) return byConference
	const byDivision = compareGroupingField(a.division, b.division)
	if (byDivision !== 0) return byDivision
	return a.name.localeCompare(b.name)
}
