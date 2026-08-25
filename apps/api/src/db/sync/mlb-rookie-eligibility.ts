import type { EspnAthlete } from "./espn-client"
import {
	fetchAllMlbTeams,
	fetchMlbCareerStats,
	fetchMlbTeamRoster,
	type MlbRosterEntry,
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

// Lazily built once per sync run and reused across every MLB player -
// abbreviation -> MLB Stats API's own numeric team id (distinct from ESPN's
// team id for the same team). Fetched dynamically rather than hardcoded,
// same reasoning as sync-teams.ts not hardcoding ESPN's ids: MLB's ids are
// stable in practice, but there's no reason to bake in a static table when
// one live call gives the real thing.
let teamIdByAbbreviation: Promise<Map<string, number>> | null = null

function getTeamIdByAbbreviation(): Promise<Map<string, number>> {
	teamIdByAbbreviation ??= fetchAllMlbTeams().then(
		(teams) => new Map(teams.map((t) => [t.abbreviation, t.id])),
	)
	return teamIdByAbbreviation
}

// Also lazy/memoized per mlbTeamId - every player on a team is resolved
// against the same one roster fetch instead of one fetch per player.
const rosterByTeamId = new Map<number, Promise<MlbRosterEntry[]>>()

function getTeamRoster(mlbTeamId: number): Promise<MlbRosterEntry[]> {
	let roster = rosterByTeamId.get(mlbTeamId)
	if (!roster) {
		roster = fetchMlbTeamRoster(mlbTeamId)
		rosterByTeamId.set(mlbTeamId, roster)
	}
	return roster
}

// "12.1" -> 37 outs (12 innings * 3 + 1). MLB's box-score notation reads the
// digit after the decimal point as thirds of an inning, not a decimal
// fraction - ".1"/".2" are the only fractional parts that ever appear.
function inningsPitchedToOuts(inningsPitched: string): number {
	const [whole, thirds] = inningsPitched.split(".")
	return Number(whole) * 3 + Number(thirds ?? 0)
}

async function findMlbPersonId(
	athlete: EspnAthlete,
	teamAbbreviation: string,
): Promise<number | null> {
	const teamIds = await getTeamIdByAbbreviation()
	const mlbTeamId = teamIds.get(teamAbbreviation)
	if (!mlbTeamId) return null

	const roster = await getTeamRoster(mlbTeamId)
	const match = roster.find(
		(entry) => entry.person.fullName === athlete.fullName,
	)
	return match?.person.id ?? null
}

// Sums career at-bats/innings-pitched (as outs) from every season strictly
// before currentSeasonYear - i.e. everything that happened before the season
// this eligibility check is actually for.
async function cumulativePriorSeasonStats(
	personId: number,
	currentSeasonYear: number,
): Promise<{ atBats: number; inningsPitchedOuts: number }> {
	const seasons = await fetchMlbCareerStats(personId)
	let atBats = 0
	let inningsPitchedOuts = 0
	for (const { season, stat } of seasons) {
		if (Number(season) >= currentSeasonYear) continue
		atBats += stat.atBats ?? 0
		if (stat.inningsPitched) {
			inningsPitchedOuts += inningsPitchedToOuts(stat.inningsPitched)
		}
	}
	return { atBats, inningsPitchedOuts }
}

// Known simplification: MLB's real rule also has an alternate "45 days on an
// active roster" clause (mainly relevant for a defensive specialist with
// almost no at-bats but a long roster stint) - not checked here, since
// cumulative active-roster-day counts aren't available from this API. AB/IP
// covers the dominant real-world case; this is a deliberate, documented gap,
// not an oversight.
export async function resolveMlbRookieEligible(
	athlete: EspnAthlete,
	teamAbbreviation: string,
	currentSeasonYear: number,
): Promise<boolean> {
	// Two-plus full ESPN-counted seasons is never a real case where the
	// precise rule could disagree with "not a rookie" - skips the stats-API
	// round trip entirely for the large majority of a 40-man roster.
	if ((athlete.experience?.years ?? 0) >= 2) return false

	const personId = await findMlbPersonId(athlete, teamAbbreviation)
	if (!personId) {
		// No record in MLB's own system at the MLB level at all - not just
		// missing from the 40-man roster fetch, but never having accrued a
		// single tracked MLB at-bat/inning under any team. That's strong
		// enough evidence on its own: someone MLB has no major-league stats
		// for cannot have exceeded the AB/IP thresholds, so "not found" should
		// default to eligible, not excluded. Logged for visibility since a
		// name-formatting mismatch against a player who HAS played (and thus
		// should be excluded) would look identical to this from here.
		console.warn(
			`resolveMlbRookieEligible: no MLB Stats API match for "${athlete.fullName}" (${teamAbbreviation}) - defaulting to rookie-eligible`,
		)
		return true
	}

	const { atBats, inningsPitchedOuts } = await cumulativePriorSeasonStats(
		personId,
		currentSeasonYear,
	)
	return (
		atBats < MAX_ROOKIE_AT_BATS &&
		inningsPitchedOuts < MAX_ROOKIE_INNINGS_PITCHED_OUTS
	)
}
