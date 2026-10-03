import type { EspnAthlete } from "./espn-client"
import { findMlbRosterEntry } from "./mlb-rosters"
import type { MlbStatGroup } from "./mlb-stats-client"

// MLB's real Rookie of the Year rule: a player stays rookie-eligible until,
// across ALL prior seasons combined, they exceed 130 at-bats or 50 innings
// pitched (or 45 days on an active roster, excluded here - see the
// module-level comment below). Unlike NBA/NFL, "zero prior seasons in the
// league" is the wrong test - a brief prior-season call-up (a few games,
// nowhere near these thresholds) still counts as a "season" toward
// seasonsInLeague without costing real MLB rookie status.
const MAX_ROOKIE_AT_BATS = 130
const MAX_ROOKIE_INNINGS_PITCHED_OUTS = 50 * 3

// "12.1" -> 37 outs (12 innings * 3 + 1). MLB's box-score notation reads the
// digit after the decimal point as thirds of an inning, not a decimal
// fraction - ".1"/".2" are the only fractional parts that ever appear.
function inningsPitchedToOuts(inningsPitched: string): number {
	const [whole, thirds] = inningsPitched.split(".")
	return Number(whole) * 3 + Number(thirds ?? 0)
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
	const entry = await findMlbRosterEntry(athlete.fullName, teamName)
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
