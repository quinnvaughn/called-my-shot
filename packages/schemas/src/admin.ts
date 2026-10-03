import { match } from "ts-pattern"
import { z } from "zod"
import { questionShapeSchema, resolutionSourceUrlSchema } from "./questions"

// Admin-only input shapes - kept in their own file, separate from the
// public-facing ones in questions.ts/users.ts, since these are only ever
// reachable through requireAdmin-gated mutations.

export const voidReasonSchema = z.enum([
	"nonsensical",
	"off_topic",
	"unsupported_sport",
	"duplicate",
	"other",
])

// countsAsStrike is required from the client, not defaulted here - whether a
// void counts against the asker is a per-void toggle, not hardcoded to the
// reason. The default *state* that toggle opens with (on for
// nonsensical/off_topic/unsupported_sport, off for duplicate/other) is a
// frontend-only concern.
export const voidQuestionSchema = z
	.object({
		questionId: z.string().uuid(),
		reason: voidReasonSchema,
		duplicateOfQuestionId: z.string().uuid().optional(),
		note: z
			.string()
			.trim()
			.max(500, "Keep it under 500 characters")
			.default(""),
		countsAsStrike: z.boolean(),
	})
	.superRefine((data, ctx) => {
		if (data.reason === "duplicate" && !data.duplicateOfQuestionId) {
			ctx.addIssue({
				code: "custom",
				path: ["duplicateOfQuestionId"],
				message: "Link the question this duplicates",
			})
		}
	})
export type VoidQuestionInput = z.infer<typeof voidQuestionSchema>

export const questionVoidedReasonSchema = z.enum([
	"subject_did_not_play",
	"game_not_completed",
	"tie",
	"no_leader",
	"leader_not_in_pool",
	"other",
])

// The settings one generated over/under template's lines are set from - see
// adminUpdateLineSetting.
export const updateLineSettingSchema = z.object({
	leagueSlug: z.string().trim().min(1),
	templateId: z.string().trim().min(1),
	shade: z
		.number()
		.min(0.5, "Shade has to be at least 0.5")
		.max(1.5, "Shade can't be more than 1.5"),
	minLine: z
		.number()
		.min(0.5, "Lowest line has to be at least 0.5")
		.refine(
			(value) => Number.isInteger(value - 0.5),
			"Lowest line has to end in .5, like the lines themselves",
		),
	minGames: z
		.number()
		.int("Minimum games has to be a whole number")
		.min(1, "Minimum games has to be at least 1"),
	autoTune: z.boolean(),
})
export type UpdateLineSettingInput = z.infer<typeof updateLineSettingSchema>

// The band one league's team numeric guesses on a stat are created with - see
// adminUpdateBandSetting.
export const updateBandSettingSchema = z.object({
	leagueSlug: z.string().trim().min(1),
	statName: z.string().trim().min(1),
	band: z
		.number()
		.int("Band has to be a whole number")
		.min(1, "Band has to be at least 1")
		.max(99, "Band can't be more than 99"),
	autoTune: z.boolean(),
})
export type UpdateBandSettingInput = z.infer<typeof updateBandSettingSchema>

// The loss rate one league's game stat leader questions on a stat are created
// with - see adminUpdateLeaderLossSetting.
export const updateLeaderLossSettingSchema = z.object({
	leagueSlug: z.string().trim().min(1),
	statName: z.string().trim().min(1),
	lossRate: z
		.number()
		.min(0.05, "Loss rate has to be at least 0.05")
		.max(1, "Loss rate can't be more than 1"),
	autoTune: z.boolean(),
})
export type UpdateLeaderLossSettingInput = z.infer<
	typeof updateLeaderLossSettingSchema
>

// The loss rate one league's single-pick title questions are created with -
// see adminUpdateTitleLossSetting.
export const updateTitleLossSettingSchema = z.object({
	leagueSlug: z.string().trim().min(1),
	awardName: z.string().trim().min(1),
	lossRate: z
		.number()
		.min(0.05, "Loss rate has to be at least 0.05")
		.max(1, "Loss rate can't be more than 1"),
	autoTune: z.boolean(),
})
export type UpdateTitleLossSettingInput = z.infer<
	typeof updateTitleLossSettingSchema
>

// Voiding a question without deleting it - see adminMarkQuestionVoided. Nobody
// is at fault in these cases, so unlike voidQuestionSchema there is no strike
// toggle.
export const adminMarkQuestionVoidedSchema = z.object({
	questionId: z.string().uuid(),
	reason: questionVoidedReasonSchema,
	note: z.string().trim().max(500, "Keep it under 500 characters").default(""),
})
export type AdminMarkQuestionVoidedInput = z.infer<
	typeof adminMarkQuestionVoidedSchema
>

// Same shape as resolveQuestionSchema, plus the two source fields an admin
// can overwrite at resolve/overturn time (see adminResolveQuestion and
// overturnDispute) - regular creator resolution never touches these, they're
// set once at question creation and left alone.
export const adminResolveQuestionSchema = z
	.object({
		shape: questionShapeSchema,
		correctOptionIds: z.array(z.string().uuid()).default([]),
		actualValue: z.number().optional(),
		resolutionNote: z
			.string()
			.trim()
			.max(500, "Keep it under 500 characters")
			.default(""),
		resolutionSource: z.string().trim().optional(),
		resolutionSourceUrl: resolutionSourceUrlSchema.optional(),
	})
	.superRefine((data, ctx) => {
		match(data.shape)
			.with(
				"player_stat_numeric_guess",
				"team_stat_numeric_guess",
				"team_season_stat_numeric_guess",
				() => {
					if (
						data.actualValue === undefined ||
						Number.isNaN(data.actualValue)
					) {
						ctx.addIssue({
							code: "custom",
							path: ["actualValue"],
							message: "Enter the actual value",
						})
					}
				},
			)
			.with(
				"player_season_award",
				"team_season_award",
				"player_game_stat_leader",
				"player_season_stat_leader",
				"player_team_season_stat_leader",
				() => {
					if (data.correctOptionIds.length < 1) {
						ctx.addIssue({
							code: "custom",
							path: ["correctOptionIds"],
							message: "Pick at least one correct option",
						})
					}
				},
			)
			.with(
				"player_stat_over_under",
				"team_stat_over_under",
				"player_season_stat_over_under",
				"team_season_stat_over_under",
				"game_total_over_under",
				"player_vs_player",
				"player_vs_player_season",
				"team_vs_team",
				"team_vs_team_season",
				"yes_no_prop",
				"player_award_finalists",
				() => {
					if (data.correctOptionIds.length !== 1) {
						ctx.addIssue({
							code: "custom",
							path: ["correctOptionIds"],
							message: "Pick exactly one correct option",
						})
					}
				},
			)
			.exhaustive()
	})
export type AdminResolveQuestionInput = z.infer<
	typeof adminResolveQuestionSchema
>

export const upholdDisputeSchema = z.object({
	disputeId: z.string().uuid(),
	note: z.string().trim().max(500, "Keep it under 500 characters").default(""),
})
export type UpholdDisputeInput = z.infer<typeof upholdDisputeSchema>

// title is always creator-supplied (generateQuestionTitle only prefills a
// suggestion client-side at creation - see the comment on title in
// createQuestionSchema in questions.ts), so this isn't overriding any
// server-generated value - just letting an admin fix a typo or awkward
// wording after the fact, on anyone's question.
export const editQuestionTitleSchema = z.object({
	questionId: z.string().uuid(),
	title: z.string().trim().min(1, "Give it a title"),
})
export type EditQuestionTitleInput = z.infer<typeof editQuestionTitleSchema>

// Official-only counterpart to voidQuestionSchema above - see deleteQuestion's
// own isOfficial check for why a user-generated question can't go through
// this path.
export const deleteQuestionSchema = z.object({
	questionId: z.string().uuid(),
})
export type DeleteQuestionInput = z.infer<typeof deleteQuestionSchema>
