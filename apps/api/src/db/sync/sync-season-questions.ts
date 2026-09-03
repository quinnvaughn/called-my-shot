import { getOfficialAccountId } from "../../lib/official-account"
import { generateSeasonQuestions } from "../../lib/season-questions"
import { getCurrentSeason } from "../../lib/seasons"
import { RECURRING_QUESTION_CATALOG } from "../catalog/recurring-question-catalog"
import type { League } from "../schema"

// One pass per league through RECURRING_QUESTION_CATALOG (win totals, MVP,
// DPOY, All-league teams, etc.) - generateSeasonQuestions is idempotent per
// question, so running this daily alongside syncGameQuestions costs nothing
// on a rerun and needs no season-boundary detection of its own (see
// db/sync/run.ts). Leagues with no catalog entry (nothing added yet) are a
// silent no-op, not an error.
//
// Requires syncSeasons/syncTeams/syncPlayers to have already run for this
// league - the templates this reads (win-total per team, award pools) all
// depend on that data existing.
export async function syncSeasonQuestions(league: League): Promise<void> {
	const templates = RECURRING_QUESTION_CATALOG[league.slug] ?? []
	if (templates.length === 0) return

	const season = await getCurrentSeason(league.id)
	if (!season) return

	const officialAccountId = await getOfficialAccountId()

	await generateSeasonQuestions({
		leagueId: league.id,
		resolutionSource: "ESPN / league official sources",
		templates,
		createdBy: officialAccountId,
	})
}
