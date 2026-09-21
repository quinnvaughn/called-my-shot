import { titleLossSettings as titleLossSettingsTable } from "../../db/schema"
import {
	bestRecordResultsByGroup,
	DEFAULT_TITLE_LOSS_RATE,
	type TitleGroup,
	titleGroups,
	titleRates,
} from "./title-calibration"
import {
	callerPicks,
	defineLossRateSetting,
	type LossRateRow,
} from "./tunable-setting"

// One league title as the admin Titles page shows it.
export type TitleLossSettingRow = LossRateRow<TitleGroup>

// Each league title's loss rate, tuned toward where a pick on the best
// record breaks even.
export const titleLossSettings = defineLossRateSetting({
	table: titleLossSettingsTable,
	keyField: "awardName",
	job: "tune-title-losses",
	templates: titleGroups,
	keyOf: (group) => group.awardName,
	defaultRate: DEFAULT_TITLE_LOSS_RATE,
	rates: titleRates,
	loadResults: bestRecordResultsByGroup,
	resultsKey: (group) => `${group.leagueSlug}:${group.awardName}`,
	callers: async (group, lookup) => {
		const league = lookup.league(group.leagueSlug)
		return league
			? callerPicks({
					leagueId: league.id,
					awardName: group.awardName,
					picksRequired: 1,
					shape: "team_season_award",
					status: "resolved",
				})
			: { picks: 0, hitRate: null }
	},
})

export const titleLossRateFor = titleLossSettings.valueFor
