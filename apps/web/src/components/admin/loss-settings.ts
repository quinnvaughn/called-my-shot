import {
	type UpdateLeaderLossSettingInput,
	type UpdateTitleLossSettingInput,
	updateLeaderLossSettingSchema,
	updateTitleLossSettingSchema,
} from "@called-my-shot/schemas"
import type { DocumentNode } from "graphql"
import type { z } from "zod"
import {
	AdminResetLeaderLossSettingDocument,
	AdminResetTitleLossSettingDocument,
	AdminUpdateLeaderLossSettingDocument,
	AdminUpdateTitleLossSettingDocument,
} from "#/graphql/admin/calibration/mutations"
import { gqlFetch } from "#/graphql/fetcher"
import {
	AdminLeaderLossSettingsDocument,
	type AdminLeaderLossSettingsQuery,
	AdminTitleLossSettingsDocument,
	type AdminTitleLossSettingsQuery,
} from "#/graphql/generated/graphql"

// One loss rate setting, whatever kind of question it prices.
export type LossSettingRow = {
	leagueSlug: string
	// The stat or the title the rate is for.
	name: string
	lossRate: number
	defaultLossRate: number
	isCustom: boolean
	autoTune: boolean
	calibration: {
		resolved: number
		// How often the pick the rate is tuned around came through: the
		// favorite on a leader question, the best record on a title.
		baselineHitRate: number | null
		blendedHitRate: number | null
		suggestedLossRate: number | null
		callerPicks: number
		callerHitRate: number | null
	}
}

// What a save or a reset comes back as.
export type LossSettingResult =
	| {
			__typename: "ValidationError"
			fieldErrors?: readonly { message: string }[] | null
	  }
	| {
			__typename: "AuthenticationError" | "AuthorizationError" | "NotFoundError"
			message: string
	  }
	| { __typename: "LeaderLossSetting" | "TitleLossSetting" }

export type LossSettingConfig<TInput> = {
	// Refetched after a save or a reset.
	settingsDocument: DocumentNode
	title: string
	subtitle: string
	description: string
	nameLabel: string
	baselineLabel: string
	modalTitle: (setting: LossSettingRow) => string
	autoTuneDescription: string
	// When to move the rate by hand, after its range and before its default.
	manualGuidance: string
	// Which questions a change applies to, as the callout names them.
	questionsLabel: string
	parse: (
		setting: LossSettingRow,
		values: { lossRate: number; autoTune: boolean },
	) => z.ZodSafeParseResult<TInput>
	update: (input: TInput) => Promise<LossSettingResult>
	reset: (setting: LossSettingRow) => Promise<LossSettingResult>
}

export function leaderLossSettingRows(
	data: AdminLeaderLossSettingsQuery,
): LossSettingRow[] {
	if (
		data.adminLeaderLossSettings.__typename !==
		"QueryAdminLeaderLossSettingsSuccess"
	) {
		return []
	}
	return data.adminLeaderLossSettings.data.map((row) => ({
		leagueSlug: row.leagueSlug,
		name: row.statName,
		lossRate: row.lossRate,
		defaultLossRate: row.defaultLossRate,
		isCustom: row.isCustom,
		autoTune: row.autoTune,
		calibration: {
			resolved: row.calibration.resolved,
			baselineHitRate: row.calibration.favoriteHitRate,
			blendedHitRate: row.calibration.blendedHitRate,
			suggestedLossRate: row.calibration.suggestedLossRate,
			callerPicks: row.calibration.callerPicks,
			callerHitRate: row.calibration.callerHitRate,
		},
	}))
}

export function titleLossSettingRows(
	data: AdminTitleLossSettingsQuery,
): LossSettingRow[] {
	if (
		data.adminTitleLossSettings.__typename !==
		"QueryAdminTitleLossSettingsSuccess"
	) {
		return []
	}
	return data.adminTitleLossSettings.data.map((row) => ({
		leagueSlug: row.leagueSlug,
		name: row.awardName,
		lossRate: row.lossRate,
		defaultLossRate: row.defaultLossRate,
		isCustom: row.isCustom,
		autoTune: row.autoTune,
		calibration: {
			resolved: row.calibration.resolved,
			baselineHitRate: row.calibration.bestRecordHitRate,
			blendedHitRate: row.calibration.blendedHitRate,
			suggestedLossRate: row.calibration.suggestedLossRate,
			callerPicks: row.calibration.callerPicks,
			callerHitRate: row.calibration.callerHitRate,
		},
	}))
}

// The loss rate one league's game stat leader questions on a stat are
// created with - see adminUpdateLeaderLossSetting.
export const leaderLossSettingConfig: LossSettingConfig<UpdateLeaderLossSettingInput> =
	{
		settingsDocument: AdminLeaderLossSettingsDocument,
		title: "Leaders",
		subtitle: "What a miss costs on a game stat leader question.",
		description:
			"A leader question's loss rate is working when a pick on the favorite, the contender with the best season average in the stat across both teams, comes out slightly ahead. The less often the favorite leads, the less a miss costs. Favorite led is this league stat's own record, counting only questions posted with a favorite. Blended leans that record on every other league stat's until it has enough of its own, and is what the rate is tuned from, once a day, unless it's set to manual. Callers is how real picks on resolved questions did, for comparison only.",
		nameLabel: "Stat",
		baselineLabel: "Favorite led",
		modalTitle: (setting) =>
			`${setting.leagueSlug.toUpperCase()} ${setting.name} leader`,
		autoTuneDescription:
			"Once enough leader questions have resolved, the rate moves a little each day toward where a pick on the favorite comes out slightly ahead. Turn off to set it yourself.",
		manualGuidance:
			"Lower it when the favorite leads too rarely, raise it when the favorite leads often.",
		questionsLabel: "leader questions",
		parse: (setting, values) =>
			updateLeaderLossSettingSchema.safeParse({
				leagueSlug: setting.leagueSlug,
				statName: setting.name,
				...values,
			}),
		update: async (input) =>
			(await gqlFetch(AdminUpdateLeaderLossSettingDocument, { input }))
				.adminUpdateLeaderLossSetting,
		reset: async (setting) =>
			(
				await gqlFetch(AdminResetLeaderLossSettingDocument, {
					leagueSlug: setting.leagueSlug,
					statName: setting.name,
				})
			).adminResetLeaderLossSetting,
	}

// The loss rate one league's single-pick title questions are created with -
// see adminUpdateTitleLossSetting.
export const titleLossSettingConfig: LossSettingConfig<UpdateTitleLossSettingInput> =
	{
		settingsDocument: AdminTitleLossSettingsDocument,
		title: "Titles",
		subtitle: "What a miss costs on a single-pick title question.",
		description:
			"A title's loss rate is working when a pick on the team with the best regular-season record in the pool comes out slightly ahead. Best record won is this league title's own record, read off each finished season. Blended leans that record on every other league's titles until it has enough of its own, and is what the rate is tuned from, once a day, unless it's set to manual. Callers is how real picks on resolved questions did, for comparison only. A title asked with several picks keeps the full rate and isn't listed.",
		nameLabel: "Title",
		baselineLabel: "Best record won",
		modalTitle: (setting) =>
			`${setting.leagueSlug.toUpperCase()} ${setting.name}`,
		autoTuneDescription:
			"Once enough titles have resolved across every league, the rate moves a little each day toward where a pick on the best record comes out slightly ahead. Turn off to set it yourself.",
		manualGuidance:
			"Lower it when the best record wins too rarely, raise it when it wins often.",
		questionsLabel: "title questions",
		parse: (setting, values) =>
			updateTitleLossSettingSchema.safeParse({
				leagueSlug: setting.leagueSlug,
				awardName: setting.name,
				...values,
			}),
		update: async (input) =>
			(await gqlFetch(AdminUpdateTitleLossSettingDocument, { input }))
				.adminUpdateTitleLossSetting,
		reset: async (setting) =>
			(
				await gqlFetch(AdminResetTitleLossSettingDocument, {
					leagueSlug: setting.leagueSlug,
					awardName: setting.name,
				})
			).adminResetTitleLossSetting,
	}
