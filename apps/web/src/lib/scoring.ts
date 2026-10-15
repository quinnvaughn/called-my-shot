// Live "if right / if wrong" preview shown while picking (before a call even
// exists) and again once it's locked in. The actual scoring formulas
// (BASE_POINTS_BY_TYPE, tierFor, earlyTierFor) live in the shared
// @called-my-shot/scoring package, imported here rather than duplicated, so
// this can never quietly drift from what the API actually scores at
// resolution - the server remains the source of truth for the real payout.
import {
	BASE_POINTS_BY_SHAPE,
	COMMUNITY_POINTS_MULT,
	type ContrarianTier,
	crowdTierFor,
	type EarlyTier,
	earlyTierFor,
	effectiveLossRate,
	isSeasonLongShape,
	type NumericPointsPreview,
	type PointsPreview,
	previewNumericPoints,
	previewSelectionPoints,
	seasonEarlyTierFor,
	type ToleranceSpec,
	tierFor,
} from "@called-my-shot/scoring"
import type { QuestionScope, QuestionShape } from "#/graphql/generated/graphql"

export type {
	ContrarianTier,
	EarlyTier,
	NumericPointsPreview,
	PointsPreview,
	ToleranceSpec,
}
export {
	crowdTierFor,
	earlyTierFor,
	isSeasonLongShape,
	previewNumericPoints,
	previewSelectionPoints,
	seasonEarlyTierFor,
	tierFor,
}

// The boldness tier's share of the field, which is read off the field's
// conviction (see crowdTotals) rather than its head count, simulated as if
// this call, at `conviction`, were already in. The counts a not-yet-submitted
// call reads don't include it yet, and adding it can swing the share hard
// while the field is small, so the preview matches what the share reads the
// instant after Lock It In rather than a before-me snapshot.
export function previewCrowdPct(
	optionConviction: number,
	fieldConviction: number,
	conviction: number,
): number {
	return (
		((optionConviction + conviction) / (fieldConviction + conviction)) * 100
	)
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
const BASE_POINTS_BY_GQL_SHAPE: Record<QuestionShape, number> = {
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

// basePointsFor in @called-my-shot/scoring, keyed by the GraphQL shape.
export function basePointsForGql(
	shape: QuestionShape,
	isOfficial: boolean,
	isPriced: boolean,
): number {
	const base = BASE_POINTS_BY_GQL_SHAPE[shape]
	return isOfficial || isPriced ? base : base * COMMUNITY_POINTS_MULT
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

// Whether a question of this shape can land on that side of a scope filter,
// which splits on whether the question hangs off a game. A yes/no prop's game
// is optional, so it's the one shape found on both sides.
export function shapeFitsScope(
	shape: QuestionShape,
	scope: QuestionScope,
): boolean {
	if (shape === "YES_NO_PROP") return true
	return isSeasonLongGqlShape(shape) === (scope === "SEASON_LONG")
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

// How many misses a hit outweighs on a question, whatever conviction or timing
// the caller picks: conviction scales the win and the loss equally, and the
// boldness and early multipliers only ever raise the win, so a side's own win
// multiplier over its loss rate is the floor. Read off the side where that's
// smallest (a priced question's likely side pays 1x and costs more than the
// question's own rate), so it holds for every pick. Floored so the number
// shown is never more than the real one. Null below 2x, where a hit and a miss
// weigh about the same and there's nothing to point out.
export function hitMultiple(
	questionRate: number,
	options: { lossRate: number | null; winMult?: number | null }[],
): number | null {
	// A numeric guess has no options, so the question's rate is the only one.
	const ratios =
		options.length > 0
			? options.map(
					(o) => (o.winMult ?? 1) / effectiveLossRate(questionRate, o.lossRate),
				)
			: [1 / questionRate]
	const ratio = Math.min(...ratios)
	if (!Number.isFinite(ratio) || ratio <= 0) return null
	const multiple = Math.floor(ratio)
	return multiple >= 2 ? multiple : null
}

// Where every conviction slider starts, and so the conviction an option's
// points are shown at before anyone has moved one.
export const DEFAULT_CONVICTION = 50

// What picking one option would pay if right and cost if wrong at
// `conviction`, as if this call were already in (see previewCrowdPct): the
// numbers an option row shows before anything is picked, and the same ones
// PointsPreview shows once it is. Season-long shapes take their early bonus
// from games played so far, which exists before a call does; a game-scoped
// one's is rank-based and always 1x for a call not yet made.
export function optionPointsPreview(
	question: {
		shape: QuestionShape
		isOfficial: boolean
		isPriced: boolean
		lossRate: number
		fieldConviction: number
		// A season-long question's share of its full points at the viewer's
		// pace so far - see SeasonPlay. Null or missing is all of them.
		viewerSeasonPlay?: { weight: number } | null
		seasonGamesPlayed?: number | null
		seasonTotalGames?: number | null
	},
	option: {
		convictionTotal: number
		lossRate: number | null
		winMult: number | null
		modelHitRate: number | null
	},
	totalOptions: number,
	conviction: number,
): PointsPreview {
	const { seasonGamesPlayed, seasonTotalGames } = question
	const earlyTier =
		isSeasonLongGqlShape(question.shape) &&
		seasonGamesPlayed != null &&
		seasonTotalGames != null
			? seasonEarlyTierFor(seasonGamesPlayed, seasonTotalGames)
			: undefined
	return previewSelectionPoints(
		basePointsForGql(question.shape, question.isOfficial, question.isPriced) *
			(question.viewerSeasonPlay?.weight ?? 1),
		effectiveLossRate(question.lossRate, option.lossRate),
		previewCrowdPct(
			option.convictionTotal,
			question.fieldConviction,
			conviction,
		),
		totalOptions,
		conviction,
		earlyTier,
		option,
	)
}

// What moved a pick's numbers, in the order they matter. An unpriced pick is
// its boldness tier and field share. A priced one is paid on its own price
// alone (the underdog's on a hit, the favorite's on a miss - see sidePrice),
// so it has no tier, and shows the field share beside the chance the model
// gives it.
export function pickMeta(
	tier: ContrarianTier | null,
	crowdPct: number,
	lossRate: number,
	option: { winMult: number | null; modelHitRate: number | null },
): string[] {
	const field = `${Math.round(crowdPct)}% of points on this side`
	const { modelHitRate } = option
	if (modelHitRate == null) return [...(tier ? [tier.label] : []), field]
	const winMult = option.winMult ?? 1
	const price =
		winMult > 1
			? `×${formatMult(winMult)} underdog`
			: modelHitRate > 0.5
				? `×${formatMult(lossRate)} favorite`
				: null
	return [
		...(price ? [price] : []),
		field,
		`${Math.round(modelHitRate * 100)}% expected`,
	]
}
