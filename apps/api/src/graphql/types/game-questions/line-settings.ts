import { updateLineSettingSchema } from "@called-my-shot/schemas"
import { requireAdmin } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import type { CalibrationRow } from "../../../lib/game-questions/line-calibration"
import {
	type LineSettingRow,
	lineSettingRow,
	lineSettingRows,
	overUnderTemplate,
	resetLineSetting,
	saveLineSetting,
} from "../../../lib/game-questions/line-settings"
import type { LineRule } from "../../../lib/game-questions/lines"
import { builder } from "../../builder"

const LineRuleRef = builder.objectRef<LineRule>("LineRule").implement({
	fields: (t) => ({
		shade: t.exposeFloat("shade"),
		minLine: t.exposeFloat("minLine"),
		minGames: t.exposeInt("minGames"),
	}),
})

const LineCalibrationRef = builder
	.objectRef<CalibrationRow>("LineCalibration")
	.implement({
		fields: (t) => ({
			resolved: t.exposeInt("resolved"),
			overRate: t.exposeFloat("overRate"),
			averageLine: t.exposeFloat("averageLine"),
			averageBlendedMean: t.exposeFloat("averageBlendedMean"),
			outsideTarget: t.exposeBoolean("outsideTarget"),
		}),
	})

// See LineSettingRow in lib/game-questions/line-settings.ts.
const LineSettingRef = builder
	.objectRef<LineSettingRow>("LineSetting")
	.implement({
		fields: (t) => ({
			leagueSlug: t.exposeString("leagueSlug"),
			templateId: t.exposeString("templateId"),
			statName: t.exposeString("statName"),
			line: t.field({ type: LineRuleRef, resolve: (row) => row.line }),
			defaultLine: t.field({
				type: LineRuleRef,
				resolve: (row) => row.defaultLine,
			}),
			isCustom: t.exposeBoolean("isCustom"),
			autoTune: t.exposeBoolean("autoTune"),
			tunedAt: t.string({
				nullable: true,
				resolve: (row) => row.tunedAt?.toISOString() ?? null,
			}),
			calibration: t.field({
				type: LineCalibrationRef,
				nullable: true,
				resolve: (row) => row.calibration,
			}),
		}),
	})

const UpdateLineSettingInput = builder.inputType("UpdateLineSettingInput", {
	fields: (t) => ({
		leagueSlug: t.string({ required: true }),
		templateId: t.string({ required: true }),
		shade: t.float({ required: true }),
		minLine: t.float({ required: true }),
		minGames: t.int({ required: true }),
		autoTune: t.boolean({ required: true }),
	}),
})

async function requireRow(leagueSlug: string, templateId: string) {
	const row = await lineSettingRow(leagueSlug, templateId)
	if (!row) throw new NotFoundError("No over/under template by that name")
	return row
}

builder.queryFields((t) => ({
	// Lines tab.
	adminLineSettings: t.field({
		type: [LineSettingRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		resolve: (_root, _args, ctx) => {
			requireAdmin(ctx)
			return lineSettingRows()
		},
	}),
}))

builder.mutationFields((t) => ({
	adminUpdateLineSetting: t.field({
		type: LineSettingRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "AdminUpdateLineSettingResult" },
		},
		args: {
			input: t.arg({ type: UpdateLineSettingInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			const parsed = updateLineSettingSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const { leagueSlug, templateId } = parsed.data
			const template = overUnderTemplate(leagueSlug, templateId)
			if (!template) {
				throw new NotFoundError("No over/under template by that name")
			}
			await saveLineSetting(template, parsed.data, admin.id)
			return requireRow(leagueSlug, templateId)
		},
	}),

	adminResetLineSetting: t.field({
		type: LineSettingRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "AdminResetLineSettingResult" },
		},
		args: {
			leagueSlug: t.arg.string({ required: true }),
			templateId: t.arg.string({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			if (!overUnderTemplate(args.leagueSlug, args.templateId)) {
				throw new NotFoundError("No over/under template by that name")
			}
			await resetLineSetting(args.leagueSlug, args.templateId)
			return requireRow(args.leagueSlug, args.templateId)
		},
	}),
}))
