import { gameQuestionLossSettings } from "../../db/schema"
import {
	DEFAULT_LEADER_LOSS_RATE,
	favoriteResultsByTemplate,
	type LeaderTemplate,
	leaderRates,
	leaderTemplates,
} from "./leader-calibration"
import {
	callerPicks,
	defineLossRateSetting,
	type LossRateRow,
} from "./tunable-setting"

// One league stat as the admin Leaders page shows it: the loss rate its
// leader questions are created with now, the default, whether
// tuneLeaderLosses is moving it, and how often the favorite led.
export type LeaderLossSettingRow = LossRateRow<LeaderTemplate>

// Each league stat's leader loss rate, tuned toward where a pick on the
// favorite breaks even.
export const leaderLossSettings = defineLossRateSetting({
	table: gameQuestionLossSettings,
	keyField: "statName",
	job: "tune-leader-losses",
	templates: leaderTemplates,
	keyOf: (template) => template.statName,
	defaultRate: DEFAULT_LEADER_LOSS_RATE,
	rates: leaderRates,
	loadResults: favoriteResultsByTemplate,
	resultsKey: (template) => `${template.leagueSlug}:${template.templateId}`,
	callers: async (template, lookup) => {
		const found = lookup.stat(template.leagueSlug, template.statName)
		return found
			? callerPicks({
					leagueId: found.leagueId,
					statId: found.stat.id,
					shape: "player_game_stat_leader",
					status: "resolved",
				})
			: { picks: 0, hitRate: null }
	},
})

export const loadLeaderLossSettings = leaderLossSettings.loadLeague
export const leaderLossRateFor = leaderLossSettings.valueFor
