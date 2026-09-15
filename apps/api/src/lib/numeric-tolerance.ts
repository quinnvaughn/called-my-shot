import { type QuestionShape, SHAPE_SUBJECT } from "@called-my-shot/scoring"
import type { StatToleranceTier } from "../db/schema"

type NumericTolerance = {
	numericTolerancePct: number | null
	numericToleranceAbsolute: number | null
}

// The tolerance band a numeric-guess question snapshots when it's created. A
// game-scoped team question takes its league's saved band when there is one
// (bandSetting - see game_question_band_settings), then the stat's team band
// (see teamToleranceTierId in db/schema/stats.ts); every other question takes
// the stat's main band. Which column is set depends on the band's mode - see
// ToleranceSpec in @called-my-shot/scoring. Null when the stat was loaded
// without its band.
export function numericToleranceFor(
	shape: QuestionShape,
	stat: {
		toleranceTier: StatToleranceTier | null
		teamToleranceTier: StatToleranceTier | null
	},
	bandSetting?: number | null,
): NumericTolerance | null {
	if (shape === "team_stat_numeric_guess" && bandSetting != null) {
		return { numericTolerancePct: null, numericToleranceAbsolute: bandSetting }
	}
	const tier =
		SHAPE_SUBJECT[shape] === "team"
			? (stat.teamToleranceTier ?? stat.toleranceTier)
			: stat.toleranceTier
	if (!tier) return null
	return {
		numericTolerancePct:
			tier.toleranceMode === "percentage" ? tier.toleranceValue : null,
		numericToleranceAbsolute:
			tier.toleranceMode === "absolute" ? tier.toleranceValue : null,
	}
}
