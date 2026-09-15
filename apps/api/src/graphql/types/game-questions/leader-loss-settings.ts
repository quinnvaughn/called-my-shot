import { updateLeaderLossSettingSchema } from "@called-my-shot/schemas"
import { requireAdmin } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { leaderTemplate } from "../../../lib/game-questions/leader-calibration"
import {
	type LeaderLossCalibration,
	type LeaderLossSettingRow,
	leaderLossSettingRow,
	leaderLossSettingRows,
	resetLeaderLossSetting,
	saveLeaderLossSetting,
} from "../../../lib/game-questions/leader-settings"
import { builder } from "../../builder"

const LeaderLossCalibrationRef = builder
	.objectRef<LeaderLossCalibration>("LeaderLossCalibration")
	.implement({
		fields: (t) => ({
			resolved: t.exposeInt("resolved"),
			favoriteHitRate: t.exposeFloat("favoriteHitRate", { nullable: true }),
			blendedHitRate: t.exposeFloat("blendedHitRate", { nullable: true }),
			suggestedLossRate: t.exposeFloat("suggestedLossRate", {
				nullable: true,
			}),
			callerPicks: t.exposeInt("callerPicks"),
			callerHitRate: t.exposeFloat("callerHitRate", { nullable: true }),
		}),
	})

// See LeaderLossSettingRow in lib/game-questions/leader-settings.ts.
const LeaderLossSettingRef = builder
	.objectRef<LeaderLossSettingRow>("LeaderLossSetting")
	.implement({
		fields: (t) => ({
			leagueSlug: t.exposeString("leagueSlug"),
			templateId: t.exposeString("templateId"),
			statName: t.exposeString("statName"),
			lossRate: t.exposeFloat("lossRate"),
			defaultLossRate: t.exposeFloat("defaultLossRate"),
			isCustom: t.exposeBoolean("isCustom"),
			autoTune: t.exposeBoolean("autoTune"),
			tunedAt: t.string({
				nullable: true,
				resolve: (row) => row.tunedAt?.toISOString() ?? null,
			}),
			calibration: t.field({
				type: LeaderLossCalibrationRef,
				resolve: (row) => row.calibration,
			}),
		}),
	})

const UpdateLeaderLossSettingInput = builder.inputType(
	"UpdateLeaderLossSettingInput",
	{
		fields: (t) => ({
			leagueSlug: t.string({ required: true }),
			statName: t.string({ required: true }),
			lossRate: t.float({ required: true }),
			autoTune: t.boolean({ required: true }),
		}),
	},
)

async function requireRow(leagueSlug: string, statName: string) {
	const row = await leaderLossSettingRow(leagueSlug, statName)
	if (!row) throw new NotFoundError("No game stat leader by that name")
	return row
}

builder.queryFields((t) => ({
	// Leaders tab.
	adminLeaderLossSettings: t.field({
		type: [LeaderLossSettingRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		resolve: (_root, _args, ctx) => {
			requireAdmin(ctx)
			return leaderLossSettingRows()
		},
	}),
}))

builder.mutationFields((t) => ({
	adminUpdateLeaderLossSetting: t.field({
		type: LeaderLossSettingRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "AdminUpdateLeaderLossSettingResult" },
		},
		args: {
			input: t.arg({ type: UpdateLeaderLossSettingInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			const parsed = updateLeaderLossSettingSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const { leagueSlug, statName } = parsed.data
			if (!leaderTemplate(leagueSlug, statName)) {
				throw new NotFoundError("No game stat leader by that name")
			}
			await saveLeaderLossSetting(parsed.data, admin.id)
			return requireRow(leagueSlug, statName)
		},
	}),

	adminResetLeaderLossSetting: t.field({
		type: LeaderLossSettingRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "AdminResetLeaderLossSettingResult" },
		},
		args: {
			leagueSlug: t.arg.string({ required: true }),
			statName: t.arg.string({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			if (!leaderTemplate(args.leagueSlug, args.statName)) {
				throw new NotFoundError("No game stat leader by that name")
			}
			await resetLeaderLossSetting(args.leagueSlug, args.statName)
			return requireRow(args.leagueSlug, args.statName)
		},
	}),
}))
