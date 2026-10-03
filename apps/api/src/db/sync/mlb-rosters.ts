import {
	fetchAllMlbTeams,
	fetchMlbTeamRoster,
	type MlbRosterEntry,
	type MlbTeam,
} from "./mlb-stats-client"
import { buildNameIndex, findByName, type NameIndex } from "./name-match"

// Built once per sync run and shared by everything that needs MLB's own
// roster (rookie eligibility, headshots): 30 roster requests (career stats
// hydrated in, see fetchMlbTeamRoster) answer the whole league. Team ids are
// fetched rather than hardcoded, same reasoning as sync-teams.ts not
// hardcoding ESPN's ids - they're stable in practice, but one live call gives
// the real thing.
let teams: Promise<MlbTeam[]> | null = null
let rosterIndex: Promise<NameIndex<MlbRosterEntry>> | null = null

export function getMlbTeams(): Promise<MlbTeam[]> {
	teams ??= fetchAllMlbTeams()
	return teams
}

async function buildRosterIndex(): Promise<NameIndex<MlbRosterEntry>> {
	const rosters = await Promise.all(
		(await getMlbTeams()).map(async (team) => ({
			team,
			roster: await fetchMlbTeamRoster(team.id),
		})),
	)
	return buildNameIndex(
		rosters.flatMap(({ team, roster }) =>
			roster.map((entry) => ({
				team: team.name,
				name: entry.person.fullName,
				value: entry,
			})),
		),
	)
}

export function getMlbRosterIndex(): Promise<NameIndex<MlbRosterEntry>> {
	rosterIndex ??= buildRosterIndex()
	return rosterIndex
}

// teamName is ESPN's team displayName, which is what MLB's own team names
// match (see MlbTeam.name).
export async function findMlbRosterEntry(
	fullName: string,
	teamName: string,
): Promise<MlbRosterEntry | null> {
	return findByName(await getMlbRosterIndex(), fullName, teamName)
}
