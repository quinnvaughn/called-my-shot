import { updateTitleLossSettingSchema } from "@called-my-shot/schemas"
import { requireAdmin } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { titleGroup } from "../../../lib/game-questions/title-calibration"
import {
	resetTitleLossSetting,
	saveTitleLossSetting,
	type TitleLossCalibration,
	type TitleLossSettingRow,
	titleLossSettingRow,
	titleLossSettingRows,
} from "../../../lib/game-questions/title-settings"
import { builder } from "../../builder"

const TitleLossCalibrationRef = builder
	.objectRef<TitleLossCalibration>("TitleLossCalibration")
	.implement({
		fields: (t) => ({
			resolved: t.exposeInt("resolved"),
			bestRecordHitRate: t.exposeFloat("bestRecordHitRate", {
				nullable: true,
			}),
			blendedHitRate: t.exposeFloat("blendedHitRate", { nullable: true }),
			suggestedLossRate: t.exposeFloat("suggestedLossRate", {
				nullable: true,
			}),
			callerPicks: t.exposeInt("callerPicks"),
			callerHitRate: t.exposeFloat("callerHitRate", { nullable: true }),
		}),
	})

// See TitleLossSettingRow in lib/game-questions/title-settings.ts.
const TitleLossSettingRef = builder
	.objectRef<TitleLossSettingRow>("TitleLossSetting")
	.implement({
		fields: (t) => ({
			leagueSlug: t.exposeString("leagueSlug"),
			awardName: t.exposeString("awardName"),
			lossRate: t.exposeFloat("lossRate"),
			defaultLossRate: t.exposeFloat("defaultLossRate"),
			isCustom: t.exposeBoolean("isCustom"),
			autoTune: t.exposeBoolean("autoTune"),
			tunedAt: t.string({
				nullable: true,
				resolve: (row) => row.tunedAt?.toISOString() ?? null,
			}),
			calibration: t.field({
				type: TitleLossCalibrationRef,
				resolve: (row) => row.calibration,
			}),
		}),
	})

const UpdateTitleLossSettingInput = builder.inputType(
	"UpdateTitleLossSettingInput",
	{
		fields: (t) => ({
			leagueSlug: t.string({ required: true }),
			awardName: t.string({ required: true }),
			lossRate: t.float({ required: true }),
			autoTune: t.boolean({ required: true }),
		}),
	},
)

async function requireRow(leagueSlug: string, awardName: string) {
	const row = await titleLossSettingRow(leagueSlug, awardName)
	if (!row) throw new NotFoundError("No title by that name")
	return row
}

builder.queryFields((t) => ({
	// Titles tab.
	adminTitleLossSettings: t.field({
		type: [TitleLossSettingRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		resolve: (_root, _args, ctx) => {
			requireAdmin(ctx)
			return titleLossSettingRows()
		},
	}),
}))

builder.mutationFields((t) => ({
	adminUpdateTitleLossSetting: t.field({
		type: TitleLossSettingRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "AdminUpdateTitleLossSettingResult" },
		},
		args: {
			input: t.arg({ type: UpdateTitleLossSettingInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			const parsed = updateTitleLossSettingSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const { leagueSlug, awardName } = parsed.data
			if (!titleGroup(leagueSlug, awardName)) {
				throw new NotFoundError("No title by that name")
			}
			await saveTitleLossSetting(parsed.data, admin.id)
			return requireRow(leagueSlug, awardName)
		},
	}),

	adminResetTitleLossSetting: t.field({
		type: TitleLossSettingRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "AdminResetTitleLossSettingResult" },
		},
		args: {
			leagueSlug: t.arg.string({ required: true }),
			awardName: t.arg.string({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			if (!titleGroup(args.leagueSlug, args.awardName)) {
				throw new NotFoundError("No title by that name")
			}
			await resetTitleLossSetting(args.leagueSlug, args.awardName)
			return requireRow(args.leagueSlug, args.awardName)
		},
	}),
}))
