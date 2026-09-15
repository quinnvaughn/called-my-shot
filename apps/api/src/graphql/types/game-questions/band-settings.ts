import { updateBandSettingSchema } from "@called-my-shot/schemas"
import type { ToleranceSpec } from "@called-my-shot/scoring"
import { requireAdmin } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { bandTemplate } from "../../../lib/game-questions/band-calibration"
import {
	type BandCalibration,
	type BandSettingRow,
	bandSettingRow,
	bandSettingRows,
	resetBandSetting,
	saveBandSetting,
} from "../../../lib/game-questions/band-settings"
import { builder } from "../../builder"

// mode is "percentage" (value is a share of the result) or "absolute" (value
// is in the stat's own unit) - see ToleranceSpec in @called-my-shot/scoring.
const BandToleranceRef = builder
	.objectRef<ToleranceSpec>("BandTolerance")
	.implement({
		fields: (t) => ({
			mode: t.string({ resolve: (spec) => spec.mode }),
			value: t.float({
				resolve: (spec) => (spec.mode === "absolute" ? spec.amount : spec.pct),
			}),
		}),
	})

const BandCalibrationRef = builder
	.objectRef<BandCalibration>("BandCalibration")
	.implement({
		fields: (t) => ({
			samples: t.exposeInt("samples"),
			hitRate: t.exposeFloat("hitRate", { nullable: true }),
			suggestedBand: t.exposeInt("suggestedBand", { nullable: true }),
			targetHitRate: t.exposeFloat("targetHitRate"),
			outsideTarget: t.exposeBoolean("outsideTarget"),
			callerCalls: t.exposeInt("callerCalls"),
			callerHitRate: t.exposeFloat("callerHitRate", { nullable: true }),
		}),
	})

// See BandSettingRow in lib/game-questions/band-settings.ts.
const BandSettingRef = builder
	.objectRef<BandSettingRow>("BandSetting")
	.implement({
		fields: (t) => ({
			leagueSlug: t.exposeString("leagueSlug"),
			templateId: t.exposeString("templateId"),
			statName: t.exposeString("statName"),
			tolerance: t.field({
				type: BandToleranceRef,
				nullable: true,
				resolve: (row) => row.tolerance,
			}),
			defaultTolerance: t.field({
				type: BandToleranceRef,
				nullable: true,
				resolve: (row) => row.defaultTolerance,
			}),
			isCustom: t.exposeBoolean("isCustom"),
			autoTune: t.exposeBoolean("autoTune"),
			tunedAt: t.string({
				nullable: true,
				resolve: (row) => row.tunedAt?.toISOString() ?? null,
			}),
			calibration: t.field({
				type: BandCalibrationRef,
				resolve: (row) => row.calibration,
			}),
		}),
	})

const UpdateBandSettingInput = builder.inputType("UpdateBandSettingInput", {
	fields: (t) => ({
		leagueSlug: t.string({ required: true }),
		statName: t.string({ required: true }),
		band: t.int({ required: true }),
		autoTune: t.boolean({ required: true }),
	}),
})

async function requireRow(leagueSlug: string, statName: string) {
	const row = await bandSettingRow(leagueSlug, statName)
	if (!row) throw new NotFoundError("No team numeric guess by that name")
	return row
}

builder.queryFields((t) => ({
	// Bands tab.
	adminBandSettings: t.field({
		type: [BandSettingRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		resolve: (_root, _args, ctx) => {
			requireAdmin(ctx)
			return bandSettingRows()
		},
	}),
}))

builder.mutationFields((t) => ({
	adminUpdateBandSetting: t.field({
		type: BandSettingRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "AdminUpdateBandSettingResult" },
		},
		args: {
			input: t.arg({ type: UpdateBandSettingInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			const parsed = updateBandSettingSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const { leagueSlug, statName } = parsed.data
			if (!bandTemplate(leagueSlug, statName)) {
				throw new NotFoundError("No team numeric guess by that name")
			}
			await saveBandSetting(parsed.data, admin.id)
			return requireRow(leagueSlug, statName)
		},
	}),

	adminResetBandSetting: t.field({
		type: BandSettingRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "AdminResetBandSettingResult" },
		},
		args: {
			leagueSlug: t.arg.string({ required: true }),
			statName: t.arg.string({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			if (!bandTemplate(args.leagueSlug, args.statName)) {
				throw new NotFoundError("No team numeric guess by that name")
			}
			await resetBandSetting(args.leagueSlug, args.statName)
			return requireRow(args.leagueSlug, args.statName)
		},
	}),
}))
