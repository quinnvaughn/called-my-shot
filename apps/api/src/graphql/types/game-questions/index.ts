// The admin pages for the generated game question settings each tune job
// moves: lines, bands, and leader and title loss rates. Importing this
// directory is what pulls them into the schema (see graphql/schema.ts).
import {
	updateBandSettingSchema,
	updateLeaderLossSettingSchema,
	updateLineSettingSchema,
	updateTitleLossSettingSchema,
} from "@called-my-shot/schemas"
import type { ToleranceSpec } from "@called-my-shot/scoring"
import type { BandCalibration } from "../../../lib/game-questions/band-settings"
import { bandSettings } from "../../../lib/game-questions/band-settings"
import { leaderLossSettings } from "../../../lib/game-questions/leader-settings"
import type { CalibrationRow } from "../../../lib/game-questions/line-calibration"
import { lineSettings } from "../../../lib/game-questions/line-settings"
import type { LineRule } from "../../../lib/game-questions/lines"
import { titleLossSettings } from "../../../lib/game-questions/title-settings"
import type { LossRateCalibration } from "../../../lib/game-questions/tunable-setting"
import { builder } from "../../builder"
import { defineSettingAdmin } from "./setting-admin"

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
defineSettingAdmin({
	name: "Band",
	key: "statName",
	notFound: "No team numeric guess by that name",
	settings: bandSettings,
	schema: updateBandSettingSchema,
	fields: (t) => ({
		templateId: t.string({ resolve: (row) => row.templateId }),
		statName: t.string({ resolve: (row) => row.statName }),
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
		calibration: t.field({
			type: BandCalibrationRef,
			resolve: (row) => row.calibration,
		}),
	}),
	inputFields: (t) => ({ band: t.int({ required: true }) }),
})

// A loss rate page's record, its own hit rate under `hitRateField`.
function lossCalibrationRef(name: string, hitRateField: string) {
	return builder.objectRef<LossRateCalibration>(name).implement({
		fields: (t) => ({
			resolved: t.exposeInt("resolved"),
			[hitRateField]: t.float({
				nullable: true,
				resolve: (calibration) => calibration.ownHitRate,
			}),
			blendedHitRate: t.exposeFloat("blendedHitRate", { nullable: true }),
			suggestedLossRate: t.exposeFloat("suggestedLossRate", {
				nullable: true,
			}),
			callerPicks: t.exposeInt("callerPicks"),
			callerHitRate: t.exposeFloat("callerHitRate", { nullable: true }),
		}),
	})
}

const LeaderLossCalibrationRef = lossCalibrationRef(
	"LeaderLossCalibration",
	"favoriteHitRate",
)

// See LeaderLossSettingRow in lib/game-questions/leader-settings.ts.
defineSettingAdmin({
	name: "LeaderLoss",
	key: "statName",
	notFound: "No game stat leader by that name",
	settings: leaderLossSettings,
	schema: updateLeaderLossSettingSchema,
	fields: (t) => ({
		templateId: t.string({ resolve: (row) => row.templateId }),
		statName: t.string({ resolve: (row) => row.statName }),
		lossRate: t.float({ resolve: (row) => row.lossRate }),
		defaultLossRate: t.float({ resolve: (row) => row.defaultLossRate }),
		calibration: t.field({
			type: LeaderLossCalibrationRef,
			resolve: (row) => row.calibration,
		}),
	}),
	inputFields: (t) => ({ lossRate: t.float({ required: true }) }),
})

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
defineSettingAdmin({
	name: "Line",
	key: "templateId",
	notFound: "No over/under template by that name",
	settings: lineSettings,
	schema: updateLineSettingSchema,
	fields: (t) => ({
		templateId: t.string({ resolve: (row) => row.templateId }),
		statName: t.string({ resolve: (row) => row.statName }),
		line: t.field({ type: LineRuleRef, resolve: (row) => row.line }),
		defaultLine: t.field({
			type: LineRuleRef,
			resolve: (row) => row.defaultLine,
		}),
		calibration: t.field({
			type: LineCalibrationRef,
			nullable: true,
			resolve: (row) => row.calibration,
		}),
	}),
	inputFields: (t) => ({
		shade: t.float({ required: true }),
		minLine: t.float({ required: true }),
		minGames: t.int({ required: true }),
	}),
})

const TitleLossCalibrationRef = lossCalibrationRef(
	"TitleLossCalibration",
	"bestRecordHitRate",
)

// See TitleLossSettingRow in lib/game-questions/title-settings.ts.
defineSettingAdmin({
	name: "TitleLoss",
	key: "awardName",
	notFound: "No title by that name",
	settings: titleLossSettings,
	schema: updateTitleLossSettingSchema,
	fields: (t) => ({
		awardName: t.string({ resolve: (row) => row.awardName }),
		lossRate: t.float({ resolve: (row) => row.lossRate }),
		defaultLossRate: t.float({ resolve: (row) => row.defaultLossRate }),
		calibration: t.field({
			type: TitleLossCalibrationRef,
			resolve: (row) => row.calibration,
		}),
	}),
	inputFields: (t) => ({ lossRate: t.float({ required: true }) }),
})
