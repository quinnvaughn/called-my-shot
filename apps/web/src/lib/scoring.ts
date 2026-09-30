// Live "if right / if wrong" preview shown while picking (before a call even
// exists) and again once it's locked in. The actual scoring formulas
// (BASE_POINTS_BY_TYPE, tierFor, earlyTierFor) live in the shared
// @called-my-shot/scoring package, imported here rather than duplicated, so
// this can never quietly drift from what the API actually scores at
// resolution - the server remains the source of truth for the real payout.
import {
	BASE_POINTS_BY_SHAPE,
	type ContrarianTier,
	type EarlyTier,
	earlyTierFor,
	isSeasonLongShape,
	pointsAtStake,
	seasonEarlyTierFor,
	TIER_MAX_MULT,
	TIER_MIN_MULT,
	type ToleranceSpec,
	tierFor,
} from "@called-my-shot/scoring"
import type { QuestionShape } from "#/graphql/generated/graphql"

export type { ContrarianTier, EarlyTier, ToleranceSpec }
export { earlyTierFor, isSeasonLongShape, seasonEarlyTierFor, tierFor }

export type PointsPreview = {
	win: number
	lose: number
	tier: ContrarianTier
	earlyTier: EarlyTier
}

// The option/question call counts a not-yet-submitted call reads are always
// "before this call" - it doesn't exist yet. Feeding that raw fieldPct
// straight into a preview means the number the caller sees right before
// submitting isn't the number they'll see right after: their own selection
// is missing from both the option's count and the total, and adding it can
// swing fieldPct hard when the field is still small (going from 3 to 4
// total callers, adding yourself moves the ratio by 25%+, versus a rounding
// error once the field is large). Simulating "as if I already submitted"
// here means the preview always matches what fieldPct actually reads the
// instant after Lock It In, not a stale before-me snapshot.
export function previewFieldPct(
	optionCallCount: number,
	totalCalls: number,
): number {
	return ((optionCallCount + 1) / (totalCalls + 1)) * 100
}

// Preview for every option-based shape - both outcomes computed at once
// since which one applies isn't known until resolution. earlyTier is
// optional and caller-computed (via earlyTierFor for game-scoped shapes or
// seasonEarlyTierFor for season-long ones - see isSeasonLongShape) rather
// than raw rank/totalCalls, since which formula applies depends on the
// question's shape, which this function has no way to know. Omitting it
// just leaves the early multiplier at 1x rather than guessing - this also
// runs before a call exists (no rank, and no meaningful "as of my own
// createdAt" games-played reading either), where 1x is the correct read
// either way. basePoints comes from BASE_POINTS_BY_SHAPE and lossRate from
// LOSS_RATE_BY_SHAPE for this question's shape.
export function previewSelectionPoints(
	basePoints: number,
	lossRate: number,
	fieldPct: number,
	totalOptions: number,
	conviction: number,
	earlyTier: EarlyTier = { mult: 1, label: "STANDARD" },
): PointsPreview {
	const stake = conviction / 100
	const tier = tierFor(fieldPct, totalOptions)
	return {
		win: Math.round(basePoints * stake * tier.mult * earlyTier.mult),
		lose: pointsAtStake(basePoints, lossRate, conviction),
		tier,
		earlyTier,
	}
}

export type NumericPointsPreview = {
	winLow: number
	winHigh: number
	lose: number
	earlyTier: EarlyTier
}

// A numeric-guess shape pays out on the same "how rare was being right"
// curve as every other shape (see numericGuessPoints in
// @called-my-shot/scoring) -
// rare here means few people, out of the whole field, landed at least as
// close to the actual value as this guess did. Unlike an option pick, that
// share genuinely can't be known before resolution (it depends on where
// everyone else's guesses end up relative to a value nobody's seen yet), so
// this reports the full possible range instead of one number. A miss is a
// flat loss of the stake at the shape's loss rate, same as every other type.
// earlyRank/earlyTotalCalls follow the same optional-before-a-call-exists
// rule as previewSelectionPoints above.
export function previewNumericPoints(
	basePoints: number,
	lossRate: number,
	conviction: number,
	earlyRank?: number,
	earlyTotalCalls?: number,
): NumericPointsPreview {
	const stake = conviction / 100
	const earlyTier =
		earlyRank !== undefined && earlyTotalCalls !== undefined
			? earlyTierFor(earlyRank, earlyTotalCalls)
			: { mult: 1, label: "STANDARD" }
	return {
		winLow: Math.round(basePoints * stake * TIER_MIN_MULT * earlyTier.mult),
		winHigh: Math.round(basePoints * stake * TIER_MAX_MULT * earlyTier.mult),
		lose: pointsAtStake(basePoints, lossRate, conviction),
		earlyTier,
	}
}

// Both multipliers come off continuous power curves (tierFor/earlyTierFor),
// so an unrounded one renders as "1.517819252974054" in a math ledger. One
// decimal is all a "why these points" line needs, and it matches the
// precision the backed-out early multiplier on ViewerStatusCard already
// showed. Display only - the full-precision value is what the point math
// runs on, here and on the server.
export function formatMult(mult: number): string {
	return String(Math.round(mult * 10) / 10)
}

// Exactly one of numericTolerancePct/numericToleranceAbsolute is ever
// non-null for a given question - see ToleranceSpec in
// @called-my-shot/scoring.
export function toleranceSpecFrom(
	pct: number | null,
	absolute: number | null,
): ToleranceSpec | null {
	if (absolute !== null) return { mode: "absolute", amount: absolute }
	if (pct !== null) return { mode: "percentage", pct }
	return null
}

// GraphQL's QuestionShape is SCREAMING_SNAKE; BASE_POINTS_BY_SHAPE (and the
// rest of @called-my-shot/scoring) key off the API's lower snake_case DB
// enum instead - this is the one explicit place that bridges the two so a
// typo can't silently fall back to the wrong base.
export const BASE_POINTS_BY_GQL_SHAPE: Record<QuestionShape, number> = {
	PLAYER_STAT_OVER_UNDER: BASE_POINTS_BY_SHAPE.player_stat_over_under,
	TEAM_STAT_OVER_UNDER: BASE_POINTS_BY_SHAPE.team_stat_over_under,
	PLAYER_SEASON_STAT_OVER_UNDER:
		BASE_POINTS_BY_SHAPE.player_season_stat_over_under,
	TEAM_SEASON_STAT_OVER_UNDER: BASE_POINTS_BY_SHAPE.team_season_stat_over_under,
	GAME_TOTAL_OVER_UNDER: BASE_POINTS_BY_SHAPE.game_total_over_under,
	PLAYER_STAT_NUMERIC_GUESS: BASE_POINTS_BY_SHAPE.player_stat_numeric_guess,
	TEAM_STAT_NUMERIC_GUESS: BASE_POINTS_BY_SHAPE.team_stat_numeric_guess,
	TEAM_SEASON_STAT_NUMERIC_GUESS:
		BASE_POINTS_BY_SHAPE.team_season_stat_numeric_guess,
	PLAYER_VS_PLAYER: BASE_POINTS_BY_SHAPE.player_vs_player,
	PLAYER_VS_PLAYER_SEASON: BASE_POINTS_BY_SHAPE.player_vs_player_season,
	TEAM_VS_TEAM: BASE_POINTS_BY_SHAPE.team_vs_team,
	TEAM_VS_TEAM_SEASON: BASE_POINTS_BY_SHAPE.team_vs_team_season,
	PLAYER_GAME_STAT_LEADER: BASE_POINTS_BY_SHAPE.player_game_stat_leader,
	PLAYER_SEASON_STAT_LEADER: BASE_POINTS_BY_SHAPE.player_season_stat_leader,
	PLAYER_TEAM_SEASON_STAT_LEADER:
		BASE_POINTS_BY_SHAPE.player_team_season_stat_leader,
	YES_NO_PROP: BASE_POINTS_BY_SHAPE.yes_no_prop,
	PLAYER_SEASON_AWARD: BASE_POINTS_BY_SHAPE.player_season_award,
	TEAM_SEASON_AWARD: BASE_POINTS_BY_SHAPE.team_season_award,
	PLAYER_AWARD_FINALISTS: BASE_POINTS_BY_SHAPE.player_award_finalists,
}

// Mirrors SEASON_LONG_SHAPES/isSeasonLongShape in @called-my-shot/scoring -
// same GQL/DB casing bridge as BASE_POINTS_BY_GQL_SHAPE above, kept as an
// explicit list rather than derived so a shape added on one side isn't
// silently assumed to match the other. Determines which earliness preview a
// pending pick's row shows: seasonEarlyTierFor (games played so far) for
// these, earlyTierFor (rank among callers) for everything else.
//
// A Record, not the boolean || chain this shape of check invites: an
// omission from a chain just reads as false, quietly pricing a pending row
// off rank-among-callers when it should be off season progress. A missing
// key here fails the build instead - the same protection
// BASE_POINTS_BY_GQL_SHAPE above already gets from being a Record.
const SEASON_LONG_BY_GQL_SHAPE: Record<QuestionShape, boolean> = {
	PLAYER_STAT_OVER_UNDER: false,
	TEAM_STAT_OVER_UNDER: false,
	PLAYER_SEASON_STAT_OVER_UNDER: true,
	TEAM_SEASON_STAT_OVER_UNDER: true,
	GAME_TOTAL_OVER_UNDER: false,
	PLAYER_STAT_NUMERIC_GUESS: false,
	TEAM_STAT_NUMERIC_GUESS: false,
	TEAM_SEASON_STAT_NUMERIC_GUESS: true,
	PLAYER_VS_PLAYER: false,
	PLAYER_VS_PLAYER_SEASON: true,
	TEAM_VS_TEAM: false,
	TEAM_VS_TEAM_SEASON: true,
	PLAYER_GAME_STAT_LEADER: false,
	PLAYER_SEASON_STAT_LEADER: true,
	PLAYER_TEAM_SEASON_STAT_LEADER: true,
	// Not season-long despite having no game: its locksAt is an arbitrary
	// creator-chosen window, not tied to season length - see the note on
	// SEASON_LONG_SHAPES in @called-my-shot/scoring.
	YES_NO_PROP: false,
	PLAYER_SEASON_AWARD: true,
	TEAM_SEASON_AWARD: true,
	PLAYER_AWARD_FINALISTS: true,
}

export function isSeasonLongGqlShape(shape: QuestionShape): boolean {
	return SEASON_LONG_BY_GQL_SHAPE[shape]
}

// The early multiplier a pending pick previews with. Season-long shapes read
// games played so far, not rank among callers. seasonGamesPlayed/
// seasonTotalGames are only ever null for a game-scoped question (or a
// season-long one with no games synced yet, where seasonEarlyTierFor's own
// zero-games guard already lands on the same preseason ceiling), so falling
// back to earlyTierFor(rank, totalCalls) there is correct either way.
export function selectionEarlyTier(
	shape: QuestionShape,
	rank: number,
	totalCalls: number,
	seasonGamesPlayed: number | null,
	seasonTotalGames: number | null,
): EarlyTier {
	return isSeasonLongGqlShape(shape) &&
		seasonGamesPlayed !== null &&
		seasonTotalGames !== null
		? seasonEarlyTierFor(seasonGamesPlayed, seasonTotalGames)
		: earlyTierFor(rank, totalCalls)
}
