import type { QuestionShape } from "@called-my-shot/scoring"
import { SHAPE_SUBJECT } from "@called-my-shot/scoring"

type TypicalLines = {
	typicalPlayerLine?: number | null
	typicalTeamLine?: number | null
}

/**
 * A suggested line for the create-question number field, read off the picked
 * stat's typical per-game value.
 *
 * Shown as a placeholder only - it never fills the field. The line is the whole
 * point of the question, so the creator has to actually pick it; a pre-filled
 * number is one they could publish without ever choosing it. This just answers
 * "what magnitude are we talking about" so the field isn't a blank stare.
 *
 * Returns undefined rather than guessing whenever the honest answer isn't
 * available - no suggestion beats a misleading one.
 */
export function suggestLine({
	shape,
	stat,
	statAggregation,
}: {
	shape: QuestionShape
	stat: TypicalLines | undefined
	statAggregation: "total" | "per_game" | undefined
}): number | undefined {
	if (!stat) return undefined

	// A season total is the stored per-game figure times a season's worth of
	// games, and nothing here knows how many that is (and it varies by league:
	// 17 for the NFL, 82 for the NBA, 162 for the MLB). Suggesting the per-game
	// number would be off by up to two orders of magnitude, so suggest nothing.
	if (statAggregation === "total") return undefined

	const player = stat.typicalPlayerLine ?? undefined
	const team = stat.typicalTeamLine ?? undefined

	// game_total_over_under is the subject-less shape: its line covers both
	// teams combined, so it's two team-sized halves.
	if (SHAPE_SUBJECT[shape] === "none") {
		return team === undefined ? undefined : snapToHalf(team * 2)
	}
	return SHAPE_SUBJECT[shape] === "player" ? player : team
}

// Matches NumberStepper's own "half" snapping: the half point at or just above
// the integer part, which is always legal whatever comes in. Doubling matters
// here because two legal team lines multiply into an illegal one - 112.5 x 2
// is exactly 225.
function snapToHalf(value: number): number {
	return Math.floor(value) + 0.5
}
