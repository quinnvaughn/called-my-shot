// Where a generated over/under's line comes from: a player's per-game average
// this season, leaning on last season while this season's sample is still
// small, shaded toward the median, then set on a half so it can't push.

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

// The generated shapes whose lines setLine sets, and so the ones
// ./line-calibration reads back and ./tune-lines moves the shade of. A team
// over/under's line is set from the team's own final scores, a player's from
// ESPN season stats, but both land in lineBasis the same way.
export const GENERATED_OVER_UNDER_SHAPES = [
	"player_stat_over_under",
	"team_stat_over_under",
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
	shade: number
	line: number
}

const roundToThousandths = (value: number) => Math.round(value * 1000) / 1000

// "category.stat" per game from ESPN's flattened season statistics. Games
// count from `gamesKey` when given (an MLB starter's strikeouts are per
// start), otherwise the stat category's own gamesPlayed and then the general
// one, same as the season extractors in lib/auto-resolve/registry.ts. Null
// with no games to divide by.
export function perGameSample(
	stats: Map<string, number>,
	statKey: string,
	gamesKey?: string,
): SeasonSample | null {
	const [category] = statKey.split(".")
	const games = gamesKey
		? stats.get(gamesKey)
		: (stats.get(`${category}.gamesPlayed`) ?? stats.get("general.gamesPlayed"))
	if (!games) return null
	return { mean: (stats.get(statKey) ?? 0) / games, games }
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
): LineBasis | null {
	const blended = blendSamples(season, prior, priorWeight)
	if (!blended || blended.games < rule.minGames) return null
	const line = Math.floor(blended.mean * rule.shade) + 0.5
	if (line < rule.minLine) return null
	return {
		seasonMean: season ? roundToThousandths(season.mean) : null,
		seasonGames: season?.games ?? 0,
		priorMean: prior ? roundToThousandths(prior.mean) : null,
		priorGames: prior?.games ?? 0,
		priorWeight,
		blendedMean: roundToThousandths(blended.mean),
		shade: rule.shade,
		line,
	}
}
