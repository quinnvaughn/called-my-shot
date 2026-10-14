// Where a generated over/under's line comes from: the subject's per-game
// average this season, leaning on last season while this season's sample is
// still small, moved toward or away from the opposing side where the template
// asks for it, shaded toward the median, then set on a half so it can't push.

export type LineRule = {
	// The fewest games, this season's plus last season's stand-ins, worth
	// setting a line from. A player short of it is skipped for the next one.
	minGames: number
	// Counting stats skew right: a few big games pull the average above the
	// typical one, so a line at the average lands under more often than over.
	// Multiplying by this moves the line toward the median. Tuned per
	// template from the admin Lines page (see ./line-settings).
	shade: number
	// The lowest line worth posting. Below it the under is close to certain.
	minLine: number
}

// The generated shapes whose lines are read off a game's score model once it
// can be built (see game-score-model.ts), so a team's line, the game total and
// who wins all come from one picture of the game. setLine and setTotalLine
// still set them before there's enough history for the model.
export const GAME_MODEL_SHAPES = [
	"team_stat_over_under",
	"game_total_over_under",
] as const

export const isGameModelShape = (shape: string) =>
	(GAME_MODEL_SHAPES as readonly string[]).includes(shape)

// The generated shapes whose lines setLine or setTotalLine sets, and so the
// ones ./line-calibration reads back and ./tune-lines moves the shade of. A team
// over/under's line is set from the team's own final scores, a player's from
// ESPN season stats, but both land in lineBasis the same way.
export const GENERATED_OVER_UNDER_SHAPES = [
	"player_stat_over_under",
	"team_stat_over_under",
	"game_total_over_under",
] as const

// One season's per-game average and the games it's over.
export type SeasonSample = { mean: number; games: number }

// Everything a generated line was set from, stored on the question so
// ./line-calibration can check each template's lines against how they
// resolved.
export type LineBasis = {
	seasonMean: number | null
	seasonGames: number
	priorMean: number | null
	priorGames: number
	priorWeight: number
	blendedMean: number
	// The blend after the opponent adjustment: the figure the line is actually
	// set from, and the one calibration measures a result against. Equal to
	// blendedMean where the template has no opponent adjustment. Optional
	// because rows written before the adjustment existed don't carry it - see
	// expectedMeanOf.
	expectedMean?: number
	opponent?: OpponentAdjustment | null
	// Which model set this line - see LINE_FORMULA. Absent on rows that
	// predate the field, which were all set the teamOnly way.
	formula?: string
	// Absent on a line read off a game's score model (see
	// game-score-model.ts), which isn't shaded: it sits where the model's own
	// chance of the over is closest to even, and pOver is that chance.
	shade?: number
	pOver?: number
	// What the expectation was multiplied by for the scoring level of the part
	// of the season the game is in - see postseasonFactor. Already in
	// expectedMean. Absent where nothing moved it.
	scoringFactor?: number
	line: number
}

// The model a line was set with. A ratio measured against one model says
// nothing about another, so each keeps its own pool and a template only ever
// reads the one it sets lines with now. A template that gained no opponent
// adjustment keeps setting lines the way it always did, and keeps its whole
// history with it.
export const LINE_FORMULA = {
	teamOnly: "team_only",
	opponentAdjusted: "opponent_adjusted",
} as const

export type LineFormula = (typeof LINE_FORMULA)[keyof typeof LINE_FORMULA]

// What a line actually set with this adjustment should be filed under.
export const formulaOf = (opponent: OpponentAdjustment | null): LineFormula =>
	opponent ? LINE_FORMULA.opponentAdjusted : LINE_FORMULA.teamOnly

// What a template sets lines under now, which is the pool its shade is tuned
// from and its user lines are priced against. A template with no opponent
// weight sets them the way it always has.
export const formulaFor = (oppWeight: number | undefined): LineFormula =>
	oppWeight === undefined
		? LINE_FORMULA.teamOnly
		: LINE_FORMULA.opponentAdjusted

// A row written before the field existed was set with the bare blend, which
// is exactly what teamOnly means.
export const formulaOfBasis = (basis: LineBasis): LineFormula =>
	(basis.formula as LineFormula | undefined) ?? LINE_FORMULA.teamOnly

// The model's expectation for a line, whichever model set it. A row from
// before the opponent adjustment has only its blend, and that was its
// expectation.
export function expectedMeanOf(basis: LineBasis): number {
	return basis.expectedMean ?? basis.blendedMean
}

// How much of the way the opponent's own figure moves the line, and what it
// was measured against.
export type OpponentAdjustment = {
	// The opponent's per-game figure in this stat, blended the same way the
	// subject's own is.
	allowedMean: number
	allowedGames: number
	// The league's per-game figure over the same pool, which is what "average
	// defense" means here.
	leagueMean: number
	// Games of league average the opponent's figure is regressed toward - see
	// opponentAdjustment.
	weight: number
	// What blendedMean is multiplied by. 1 for an exactly average opponent.
	multiplier: number
}

// A team's points allowed over a handful of games is mostly noise: the
// game-to-game spread dwarfs the real gap between defenses, so an early
// number that looks elite usually isn't. The fix is the standard one -
// regress it toward the league average, giving the raw figure n / (n + weight)
// of its weight, where weight is the league's own ratio of game variance to
// true between-team variance. Measured off 2025 game logs, that is about 12
// games for NFL points, 13 for NBA points and 45 for MLB runs, which is why an
// opponent two games into a season barely moves a line and a full season's
// worth moves it most of the way.
//
// Null when there is nothing to measure against, which leaves the line on the
// subject's own average rather than on a guess.
export function opponentAdjustment(
	allowed: SeasonSample | null,
	leagueMean: number | null,
	weight: number,
): OpponentAdjustment | null {
	if (!allowed || !leagueMean || leagueMean <= 0 || weight < 0) return null
	const trust = allowed.games / (allowed.games + weight)
	const regressed = leagueMean + trust * (allowed.mean - leagueMean)
	return {
		allowedMean: roundToThousandths(allowed.mean),
		allowedGames: allowed.games,
		leagueMean: roundToThousandths(leagueMean),
		weight,
		multiplier: roundToThousandths(regressed / leagueMean),
	}
}

const roundToThousandths = (value: number) => Math.round(value * 1000) / 1000

// "category.stat" per game from ESPN's flattened season statistics, or
// several added up. Games count from `gamesKey` when given (an MLB starter's
// strikeouts are per start), otherwise the stat category's own gamesPlayed and
// then the general one, same as the season extractors in
// lib/auto-resolve/registry.ts. A sum across categories goes straight to the
// general count. Null with no games to divide by.
export function perGameSample(
	stats: Map<string, number>,
	statKey: string | readonly string[],
	gamesKey?: string,
): SeasonSample | null {
	const keys = typeof statKey === "string" ? [statKey] : statKey
	const categories = new Set(keys.map((key) => key.split(".")[0]))
	const [category] = categories.size === 1 ? categories : [undefined]
	const games = gamesKey
		? stats.get(gamesKey)
		: ((category ? stats.get(`${category}.gamesPlayed`) : undefined) ??
			stats.get("general.gamesPlayed"))
	if (!games) return null
	const total = keys.reduce((sum, key) => sum + (stats.get(key) ?? 0), 0)
	return { mean: total / games, games }
}

// Last season only matters until this season has priorWeight games of its
// own, so it isn't fetched past that.
export function needsPriorSeason(
	season: SeasonSample | null,
	priorWeight: number,
): boolean {
	return (season?.games ?? 0) < priorWeight
}

// Last season stands in for the games this season hasn't had yet: it counts
// as priorWeight minus this season's games, and never as more games than it
// actually had. Its pull fades one game at a time rather than dropping out
// all at once. Null with neither season to go on.
export function blendSamples(
	season: SeasonSample | null,
	prior: SeasonSample | null,
	priorWeight: number,
): SeasonSample | null {
	const seasonGames = season?.games ?? 0
	const priorGames = prior
		? Math.min(prior.games, Math.max(0, priorWeight - seasonGames))
		: 0
	const games = seasonGames + priorGames
	if (games === 0) return null
	const total =
		(season ? season.mean * seasonGames : 0) +
		(prior ? prior.mean * priorGames : 0)
	return { mean: total / games, games }
}

// Null when the sample is too thin or the line would fall under the rule's
// floor. floor(x) + 0.5 keeps every line off a whole number, which
// createQuestionSchema requires of an over/under.
export function setLine(
	season: SeasonSample | null,
	prior: SeasonSample | null,
	priorWeight: number,
	rule: LineRule,
	opponent: OpponentAdjustment | null = null,
): LineBasis | null {
	const blended = blendSamples(season, prior, priorWeight)
	if (!blended || blended.games < rule.minGames) return null
	const expected = blended.mean * (opponent?.multiplier ?? 1)
	const line = Math.floor(expected * rule.shade) + 0.5
	if (line < rule.minLine) return null
	return {
		seasonMean: season ? roundToThousandths(season.mean) : null,
		seasonGames: season?.games ?? 0,
		priorMean: prior ? roundToThousandths(prior.mean) : null,
		priorGames: prior?.games ?? 0,
		priorWeight,
		blendedMean: roundToThousandths(blended.mean),
		expectedMean: roundToThousandths(expected),
		opponent,
		formula: formulaOf(opponent),
		shade: rule.shade,
		line,
	}
}

// One team's side of a game total: its own scoring, and how much the other
// side moves it.
export type TotalSide = {
	season: SeasonSample | null
	prior: SeasonSample | null
	opponent: OpponentAdjustment | null
}

// A game total's line: each side's expected score the way setLine would set
// it, added together, then shaded and set on a half. Null when either side is
// too thin to set its own line from, or the total falls under the rule's
// floor. The basis stores the summed figures, so calibration reads a game
// total's result against its expectation the same way it reads a team's.
// Opponent-adjusted only when both sides can be: a sum with one side adjusted
// and one not is neither model, so then neither side is.
export function setTotalLine(
	sides: [TotalSide, TotalSide],
	priorWeight: number,
	rule: LineRule,
): LineBasis | null {
	const blended = sides.map((side) =>
		blendSamples(side.season, side.prior, priorWeight),
	)
	const [a, b] = blended
	if (!a || !b || a.games < rule.minGames || b.games < rule.minGames) {
		return null
	}
	const adjusted = sides.every((side) => side.opponent !== null)
	const expected = sides.reduce(
		(sum, side, i) =>
			sum +
			(blended[i]?.mean ?? 0) *
				(adjusted ? (side.opponent?.multiplier ?? 1) : 1),
		0,
	)
	const line = Math.floor(expected * rule.shade) + 0.5
	if (line < rule.minLine) return null
	const sumOf = (pick: (side: TotalSide) => SeasonSample | null) => {
		const [x, y] = sides.map(pick)
		return x && y ? roundToThousandths(x.mean + y.mean) : null
	}
	return {
		seasonMean: sumOf((side) => side.season),
		seasonGames: Math.min(...sides.map((side) => side.season?.games ?? 0)),
		priorMean: sumOf((side) => side.prior),
		priorGames: Math.min(...sides.map((side) => side.prior?.games ?? 0)),
		priorWeight,
		blendedMean: roundToThousandths(a.mean + b.mean),
		expectedMean: roundToThousandths(expected),
		opponent: null,
		formula: adjusted ? LINE_FORMULA.opponentAdjusted : LINE_FORMULA.teamOnly,
		shade: rule.shade,
		line,
	}
}
