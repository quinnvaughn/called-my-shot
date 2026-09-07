import type { EspnAthlete } from "./espn-client"
import {
	fetchAllMlbTeams,
	fetchMlbTeamRoster,
	type MlbRosterEntry,
	type MlbStatGroup,
} from "./mlb-stats-client"

// MLB's real Rookie of the Year rule: a player stays rookie-eligible until,
// across ALL prior seasons combined, they exceed 130 at-bats or 50 innings
// pitched (or 45 days on an active roster, excluded here - see the
// module-level comment below). Unlike NBA/NFL, "zero prior seasons in the
// league" is the wrong test - a brief prior-season call-up (a few games,
// nowhere near these thresholds) still counts as a "season" toward
// seasonsInLeague without costing real MLB rookie status.
const MAX_ROOKIE_AT_BATS = 130
const MAX_ROOKIE_INNINGS_PITCHED_OUTS = 50 * 3

// ESPN writes names without diacritics ("Ronald Acuna Jr.") where MLB keeps
// them ("Ronald Acuña Jr."), so a raw string compare drops a few dozen
// players league-wide - and a player who fails to match falls through to the
// experience-only fallback below rather than getting the real rule applied.
// Punctuation and hyphen/space differences are folded for the same reason.
function normalizeName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{Mn}/gu, "")
		.toLowerCase()
		.replace(/[.,']/g, "")
		.replace(/[-\s]+/g, " ")
		.trim()
}

type RosterIndex = {
	// MLB team name (which is also ESPN's team displayName - see MlbTeam.name)
	// -> that team's 40-man, by normalized player name.
	byTeamName: Map<string, Map<string, MlbRosterEntry>>
	// Every 40-man player in the league, by normalized name, for the case
	// where ESPN still lists someone on the team he was traded off of. A name
	// held by more than one player maps to null rather than to a coin flip -
	// the wrong Luis Garcia would be worse than no match at all.
	byName: Map<string, MlbRosterEntry | null>
}

// Built once per sync run and reused across every MLB player: 30 roster
// requests (career stats hydrated in, see fetchMlbTeamRoster) answer
// eligibility for the whole league. Team ids are fetched rather than
// hardcoded, same reasoning as sync-teams.ts not hardcoding ESPN's ids -
// they're stable in practice, but one live call gives the real thing.
let rosterIndex: Promise<RosterIndex> | null = null

async function buildRosterIndex(): Promise<RosterIndex> {
	const teams = await fetchAllMlbTeams()
	const rosters = await Promise.all(
		teams.map(async (team) => ({
			team,
			roster: await fetchMlbTeamRoster(team.id),
		})),
	)
	const byTeamName = new Map<string, Map<string, MlbRosterEntry>>()
	const byName = new Map<string, MlbRosterEntry | null>()
	for (const { team, roster } of rosters) {
		const byPlayer = new Map<string, MlbRosterEntry>()
		for (const entry of roster) {
			const key = normalizeName(entry.person.fullName)
			byPlayer.set(key, entry)
			byName.set(key, byName.has(key) ? null : entry)
		}
		byTeamName.set(team.name, byPlayer)
	}
	return { byTeamName, byName }
}

function getRosterIndex(): Promise<RosterIndex> {
	rosterIndex ??= buildRosterIndex()
	return rosterIndex
}

// "12.1" -> 37 outs (12 innings * 3 + 1). MLB's box-score notation reads the
// digit after the decimal point as thirds of an inning, not a decimal
// fraction - ".1"/".2" are the only fractional parts that ever appear.
function inningsPitchedToOuts(inningsPitched: string): number {
	const [whole, thirds] = inningsPitched.split(".")
	return Number(whole) * 3 + Number(thirds ?? 0)
}

// The player's own team is tried first so a shared name resolves to the
// right man whenever ESPN and MLB agree on where he plays.
async function findRosterEntry(
	athlete: EspnAthlete,
	teamName: string,
): Promise<MlbRosterEntry | null> {
	const index = await getRosterIndex()
	const key = normalizeName(athlete.fullName)
	return (
		index.byTeamName.get(teamName)?.get(key) ?? index.byName.get(key) ?? null
	)
}

// Sums at-bats/innings-pitched (as outs) from every season strictly before
// currentSeasonYear - i.e. everything that happened before the season this
// eligibility check is actually for.
//
// At-bats are read only out of the hitting group and innings only out of the
// pitching group. MLB puts an `atBats` field on both, but a pitching split's
// at-bats are the ones taken AGAINST him: Parker Messick's 2025 line is 39.2
// innings and 159 at-bats faced, which counted as his own would put a
// plainly rookie-eligible starter 29 at-bats past the hitters' threshold.
// Two-way players carry both groups and are correctly charged for each.
export function priorSeasonWorkload(
	stats: MlbStatGroup[] | undefined,
	currentSeasonYear: number,
): { atBats: number; inningsPitchedOuts: number } {
	let atBats = 0
	let inningsPitchedOuts = 0
	for (const group of stats ?? []) {
		for (const { season, stat } of group.splits) {
			if (Number(season) >= currentSeasonYear) continue
			if (group.group.displayName === "hitting") {
				atBats += stat.atBats ?? 0
			} else if (stat.inningsPitched) {
				inningsPitchedOuts += inningsPitchedToOuts(stat.inningsPitched)
			}
		}
	}
	return { atBats, inningsPitchedOuts }
}

export function isUnderRookieThresholds(workload: {
	atBats: number
	inningsPitchedOuts: number
}): boolean {
	return (
		workload.atBats < MAX_ROOKIE_AT_BATS &&
		workload.inningsPitchedOuts < MAX_ROOKIE_INNINGS_PITCHED_OUTS
	)
}

// Known simplification: MLB's real rule also has an alternate "45 days on an
// active roster" clause (mainly relevant for a defensive specialist with
// almost no at-bats but a long roster stint) - not checked here, since
// cumulative active-roster-day counts aren't available from this API. AB/IP
// covers the dominant real-world case; this is a deliberate, documented gap,
// not an oversight.
//
// Every player gets the real cumulative check, with no shortcut off ESPN's
// experience.years. ESPN counts a debut season as a full year, so a
// September call-up reads as two years of experience in the following
// season while still being squarely rookie-eligible - exactly the
// population this exists to get right.
export async function resolveMlbRookieEligible(
	athlete: EspnAthlete,
	teamName: string,
	currentSeasonYear: number,
): Promise<boolean> {
	const entry = await findRosterEntry(athlete, teamName)
	if (!entry) {
		// Not on this team's 40-man - most often a non-roster player ESPN
		// lists anyway, but it also covers a name this side couldn't match.
		// Falls back to the same test the leagues without a hook use rather
		// than to a blanket "eligible": a veteran whose 40-man spot was
		// cleared (60-day IL, DFA) must not land in a Rookie of the Year pool
		// on the strength of a failed lookup. Logged since the two cases are
		// indistinguishable from here.
		console.warn(
			`resolveMlbRookieEligible: no MLB Stats API 40-man match for "${athlete.fullName}" (${teamName}) - falling back to experience.years`,
		)
		return (athlete.experience?.years ?? 0) === 0
	}

	return isUnderRookieThresholds(
		priorSeasonWorkload(entry.person.stats, currentSeasonYear),
	)
}
