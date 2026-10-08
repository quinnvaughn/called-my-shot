// Shared scoring math - the ONE place these formulas live. Previously this
// was duplicated by hand across the API (the real scoring, run at
// resolution) and apps/web/src/lib/scoring.ts (a live preview shown while
// picking and while a call is pending), kept in sync only by manually
// copying changes across both. That's exactly the kind of drift risk a
// shared workspace package exists to remove - both apps depend on this one
// instead of maintaining their own copy.

export type QuestionShape =
	| "player_stat_over_under"
	| "team_stat_over_under"
	| "player_season_stat_over_under"
	| "team_season_stat_over_under"
	| "game_total_over_under"
	| "player_stat_numeric_guess"
	| "team_stat_numeric_guess"
	| "player_vs_player"
	| "player_vs_player_season"
	| "team_vs_team"
	| "team_vs_team_season"
	| "yes_no_prop"
	| "player_season_award"
	| "team_season_award"
	| "player_award_finalists"
	| "team_season_stat_numeric_guess"
	| "player_game_stat_leader"
	| "player_season_stat_leader"
	| "player_team_season_stat_leader"

// Difficulty varies by format, not by any individual pick - a binary pick
// needs less signal to call correctly than a continuous numeric guess, so
// the pool of points at stake scales with the format itself. This is
// independent of the contrarian tier and earliness bonus below, which are
// per-call and layer on top of whichever base a question's shape starts
// from. Grouped by structural mechanism, not by subject - every shape that's
// functionally an exactly-2-option pick (yes_no_prop, player_vs_player,
// team_vs_team) shares one rate regardless of whether it has a player, team,
// or no subject at all.
export const BASE_POINTS_BY_SHAPE: Record<QuestionShape, number> = {
	yes_no_prop: 150,
	player_vs_player: 150,
	player_vs_player_season: 150,
	team_vs_team: 150,
	team_vs_team_season: 150,
	player_stat_over_under: 150,
	team_stat_over_under: 150,
	// Same rate as the game-scoped pair above - still a straight 2-option pick
	// mechanically, a season-long line doesn't change that.
	player_season_stat_over_under: 150,
	team_season_stat_over_under: 150,
	game_total_over_under: 150,
	player_award_finalists: 200,
	player_season_award: 250,
	team_season_award: 250,
	// Was 300 - highest of every shape. Trimmed toward the award shapes rather
	// than left the clear outlier (see numericGuessPoints below for how a
	// hit's multiplier is earned - same "how rare was being right" question
	// as every other shape now, not an easier one).
	player_stat_numeric_guess: 250,
	team_stat_numeric_guess: 250,
	// Season-scoped sibling of the numeric-guess pair above - same rate.
	team_season_stat_numeric_guess: 250,
	// Pool-based single pick, same mechanism as player_season_award with
	// picksRequired 1 - not the exactly-2-option family above.
	player_game_stat_leader: 250,
	// Same pool-based mechanism as the game-scoped leader above, and the same
	// rate for the same reason the season over/unders match their game-scoped
	// pair: a season-long window changes what has to be forecast, not the
	// structure of the pick.
	player_season_stat_leader: 250,
	player_team_season_stat_leader: 250,
}

// What a pick with no edge beyond the reference pick a rate is priced
// against (a coin flip, the favorite) expects to win per committed point.
// Positive on purpose: this is a game people play for fun, and a player who
// makes ordinary picks should drift up over a season rather than grind flat
// or slide. Every rate derived from a hit rate aims here (targetLossRate,
// targetHitRate) rather than at break-even.
export const PLAYER_EDGE = 0.02

const roundRate = (value: number) => Math.round(value * 100) / 100

// The loss rate at which a pick that hits `hitRate` of the time expects
// PLAYER_EDGE per committed point: a hit pays the committed points, a miss
// costs committed x rate, so hitRate - (1 - hitRate) x rate = PLAYER_EDGE.
// Infinite for a pick that always hits, and negative for one that hits less
// often than the edge itself, so callers bound it.
export function targetLossRate(hitRate: number): number {
	return (hitRate - PLAYER_EDGE) / (1 - hitRate)
}

// The hit rate at which a pick with a given loss rate expects PLAYER_EDGE -
// the inverse of targetLossRate. What a tuned tolerance band aims for.
export function targetHitRate(lossRate: number): number {
	return (lossRate + PLAYER_EDGE) / (1 + lossRate)
}

// Every exactly-2-option shape: priced as a coin flip.
const COIN_FLIP_LOSS_RATE = roundRate(targetLossRate(0.5))

// The fraction of committed points a miss costs, set per shape. A 2-option
// pick lands near a coin flip, so it's priced as one. A numeric guess or a stat leader misses far more often than it hits,
// and at a full-stake loss the expected result sits well below an easy
// 2-option favorite, so nobody would take them. The rarity multiplier can't
// make up that gap on its own: it's read off the field, and with only one or
// two callers the field says nothing (a lone caller always holds 100% of it,
// which is a x1 multiplier). A fixed rate per shape also means the loss is
// known exactly when the call is made. A game stat leader question's rate is
// tuned per league and stat from how often the favorite leads, and saved on
// the question when it's created (questions.lossRate) - the value here is its
// default until a league stat has one.
export const LOSS_RATE_BY_SHAPE: Record<QuestionShape, number> = {
	yes_no_prop: COIN_FLIP_LOSS_RATE,
	player_vs_player: COIN_FLIP_LOSS_RATE,
	player_vs_player_season: COIN_FLIP_LOSS_RATE,
	team_vs_team: COIN_FLIP_LOSS_RATE,
	team_vs_team_season: COIN_FLIP_LOSS_RATE,
	player_stat_over_under: COIN_FLIP_LOSS_RATE,
	team_stat_over_under: COIN_FLIP_LOSS_RATE,
	player_season_stat_over_under: COIN_FLIP_LOSS_RATE,
	team_season_stat_over_under: COIN_FLIP_LOSS_RATE,
	game_total_over_under: COIN_FLIP_LOSS_RATE,
	// Only a fallback: a finalists question's rate comes from how many
	// finalists it has - see defaultLossRate.
	player_award_finalists: 0.5,
	// A single pick from a whole league: even the favorite for an MVP wins
	// about a third of the time. A multi-pick award is 1 - see
	// defaultLossRate.
	player_season_award: roundRate(targetLossRate(1 / 3)),
	// A title from the whole league or a conference: the best record wins a
	// small share of them. Tuned per league and award from how often it does.
	team_season_award: 0.3,
	player_stat_numeric_guess: 0.5,
	team_stat_numeric_guess: 0.5,
	team_season_stat_numeric_guess: 0.5,
	player_game_stat_leader: 0.25,
	// A whole-league pool over a whole season, where the early leader often
	// holds on.
	player_season_stat_leader: 0.5,
	// One roster, where the favorite is usually obvious (the starter who plays
	// the most, the team's top scorer) and holds on more often than not, so a
	// miss costs the full stake - the most a question's own rate can. Untuned
	// until there are resolved questions to measure the favorite against.
	player_team_season_stat_leader: 1,
}

// The loss rate a question is created with when nothing tuned applies. Most
// shapes take LOSS_RATE_BY_SHAPE as is. A finalists question is priced for a
// pick at random among its finalists (see targetLossRate), since there's no
// favorite to measure against. An award asked
// with several picks is scored one pick at a time, and each pick is among
// several winners, so it keeps the full rate.
export function defaultLossRate(
	shape: QuestionShape,
	question: { picksRequired?: number | null; optionCount?: number },
): number {
	const { picksRequired, optionCount } = question
	if (shape === "player_award_finalists" && optionCount && optionCount > 1) {
		const rate = targetLossRate(1 / optionCount)
		return roundRate(Math.min(1, Math.max(0.05, rate)))
	}
	if (
		(shape === "player_season_award" || shape === "team_season_award") &&
		(picksRequired ?? 1) > 1
	) {
		return 1
	}
	return LOSS_RATE_BY_SHAPE[shape]
}

// The hit rate where a pick's wins and losses cancel out at a x1 multiplier:
// a hit pays the committed points and a miss costs committed x loss rate, so
// they even out at lossRate / (1 + lossRate). The zero point of a report
// card's grade.
export function breakEvenHitRate(lossRate: number): number {
	return lossRate / (1 + lossRate)
}

// The loss rate a pick that hits `hitRate` of the time breaks even at - the
// inverse of breakEvenHitRate. Infinite for a pick that always hits.
export function breakEvenLossRate(hitRate: number): number {
	return hitRate / (1 - hitRate)
}

// The most a priced side's miss can cost, as a share of committed, and the
// least. The likely side of a lopsided question costs more than committed on
// a miss, but the price comes from how past results landed, and that history
// can't see a real change like a new role. The cap keeps a miss the model got
// wrong from costing more than twice the call, at the price of a side likelier
// than about 67% keeping more than PLAYER_EDGE. The floor keeps a long shot's
// miss from costing nothing at all.
export const SIDE_LOSS_RATE_BOUNDS = { min: 0.05, max: 2 }

// The most a priced side's hit can pay before the boldness and early bonuses,
// as a multiple of committed. The unlikely side of a lopsided question pays
// more on a hit, but past about a 20% chance the model's own error is a large
// share of what it's pricing, so a longer shot is priced on its miss instead
// (see sidePrice) rather than on a payout nobody can stand behind.
export const SIDE_WIN_MULT_MAX = 4

// The chance a result lands over `line`, read off how past results landed
// against their own mean (`ratios`, result / mean). Smoothed by half a result
// on each side so a line past every ratio never reads as a sure thing.
export function overProbability(
	ratios: number[],
	mean: number,
	line: number,
): number {
	const threshold = line / mean
	const over = ratios.filter((ratio) => ratio > threshold).length
	return (over + 0.5) / (ratios.length + 1)
}

// What a priced side's hit pays (winMult, a multiple of committed before the
// boldness and early bonuses) and its miss costs (lossRate, a share of
// committed).
export type SidePrice = { winMult: number; lossRate: number }

// Each side's price for an over/under whose over lands `pOver` of the time -
// see sidePrice.
export function sidePrices(pOver: number): {
	over: SidePrice
	under: SidePrice
} {
	return { over: sidePrice(pOver), under: sidePrice(1 - pOver) }
}

// One side's price from the model's chance it hits, set so a caller with no
// edge expects PLAYER_EDGE whichever side they take: hitRate x winMult -
// (1 - hitRate) x lossRate = PLAYER_EDGE. An even chance is a coin flip, a hit
// paying committed and a miss costing the coin flip's rate, and only one half
// of the price moves away from it on each side:
//
// - The likely side's hit still pays committed, and its miss costs more (see
//   targetLossRate), up to SIDE_LOSS_RATE_BOUNDS.max.
// - The unlikely side's miss stays at the coin flip's rate, and its hit pays
//   more, up to SIDE_WIN_MULT_MAX. A longer shot than that cap covers pays
//   the cap and costs less on a miss instead, down to
//   SIDE_LOSS_RATE_BOUNDS.min.
//
// So nobody is paid less than they committed for being right, taking the
// long shot is what pays big, and only the likely side's cap leaves anyone
// off PLAYER_EDGE, in their favor.
export function sidePrice(modelHitRate: number): SidePrice {
	const hitRate = Math.min(1, Math.max(0, modelHitRate))
	if (hitRate >= 0.5) {
		return {
			winMult: 1,
			lossRate:
				hitRate === 0.5
					? COIN_FLIP_LOSS_RATE
					: roundRate(
							Math.min(SIDE_LOSS_RATE_BOUNDS.max, targetLossRate(hitRate)),
						),
		}
	}
	const winMult = (PLAYER_EDGE + (1 - hitRate) * COIN_FLIP_LOSS_RATE) / hitRate
	if (winMult <= SIDE_WIN_MULT_MAX) {
		return { winMult: roundRate(winMult), lossRate: COIN_FLIP_LOSS_RATE }
	}
	const lossRate = (hitRate * SIDE_WIN_MULT_MAX - PLAYER_EDGE) / (1 - hitRate)
	return {
		winMult: SIDE_WIN_MULT_MAX,
		lossRate: roundRate(Math.max(SIDE_LOSS_RATE_BOUNDS.min, lossRate)),
	}
}

// The chance the first side of a head-to-head out-produces the second, from
// past games where both sides' results are known together (`pairs`, each
// side's result / expectation in one game, first side first). Each past game
// is replayed at these two expectations, and the share the first side wins
// is the chance. Unlike duelProbability, whatever moved both sides of one game
// at once (its pace, the score, the home side's edge) stays in. A tie counts
// half, smoothed by half a game on each side.
export function pairedDuelProbability(
	pairs: [number, number][],
	firstMean: number,
	secondMean: number,
): number {
	let wins = 0
	for (const [first, second] of pairs) {
		const a = first * firstMean
		const b = second * secondMean
		if (a > b) wins += 1
		else if (a === b) wins += 0.5
	}
	return (wins + 0.5) / (pairs.length + 1)
}

// The chance the first side of a head-to-head out-produces the second, from
// each side's expected figure and how past results landed against their own
// expectation (`ratios`, result / expectation, as in overProbability). Every
// pairing of one past ratio per side is a plausible game, and the share the
// first side wins is the chance. A tie counts half. Smoothed by half a
// pairing on each side, like overProbability, so no duel reads as certain.
export function duelProbability(
	ratios: number[],
	firstMean: number,
	secondMean: number,
): number {
	let wins = 0
	for (const first of ratios) {
		for (const second of ratios) {
			const a = first * firstMean
			const b = second * secondMean
			if (a > b) wins += 1
			else if (a === b) wins += 0.5
		}
	}
	return (wins + 0.5) / (ratios.length * ratios.length + 1)
}

// The loss rate a selection is scored at: its option's own rate when the
// question priced its sides, else the question's.
export function effectiveLossRate(
	questionRate: number,
	optionRate: number | null | undefined,
): number {
	return optionRate ?? questionRate
}

// Season-long shapes (no gameId, open across the whole season) score
// earliness off how much of the season had actually happened when the call
// was made (seasonEarlyTierFor, below) instead of rank-among-callers - call
// volume doesn't track season progress evenly, so "3rd call out of 40" means
// wildly different things depending on whether that happened in week one or
// week ten. Game-scoped shapes (locksAt = game.startsAt) keep rank-based
// earlyTierFor - a single game's field converges over hours, not months,
// where rank-among-callers is still the right proxy (see earlyTierFor).
// yes_no_prop is deliberately NOT here even though it has no gameId - its
// locksAt is an arbitrary creator-chosen window (could be three days), not
// tied to season length, so rank-based earliness stays the right fit for it.
export const SEASON_LONG_SHAPES = new Set<QuestionShape>([
	"player_season_stat_over_under",
	"team_season_stat_over_under",
	"player_vs_player_season",
	"team_vs_team_season",
	"player_season_award",
	"team_season_award",
	"player_award_finalists",
	// No gameId, same as the season-scoped over/under pair above.
	"team_season_stat_numeric_guess",
	"player_season_stat_leader",
	"player_team_season_stat_leader",
])

export function isSeasonLongShape(shape: QuestionShape): boolean {
	return SEASON_LONG_SHAPES.has(shape)
}

// Whose performance a shape is actually about. Drives the stat catalog filter
// (a team stat can't be asked of a player) and which picker the create form
// shows.
//
// "none" is not "unknown": game_total_over_under's subject is the game itself,
// and yes_no_prop's is whoever the creator names, so neither has a fixed side.
//
// A Record rather than a Set like the groups below, for the reason spelled out
// on NUMERIC_GUESS_BY_SHAPE in apps/web's question-labels.ts: a set treats an
// omitted shape as "not a player shape", which would silently show a new shape
// the wrong picker. Every shape has to be answered, so a newly added one fails
// the build instead.
export const SHAPE_SUBJECT: Record<QuestionShape, "player" | "team" | "none"> =
	{
		player_stat_over_under: "player",
		team_stat_over_under: "team",
		player_season_stat_over_under: "player",
		team_season_stat_over_under: "team",
		game_total_over_under: "none",
		player_stat_numeric_guess: "player",
		team_stat_numeric_guess: "team",
		team_season_stat_numeric_guess: "team",
		player_vs_player: "player",
		player_vs_player_season: "player",
		team_vs_team: "team",
		team_vs_team_season: "team",
		player_game_stat_leader: "player",
		player_season_stat_leader: "player",
		player_team_season_stat_leader: "player",
		yes_no_prop: "none",
		player_season_award: "player",
		team_season_award: "team",
		player_award_finalists: "player",
	}

// The families a streak is counted within. A streak belongs to one league and
// one family, so a missed player stat call doesn't end a run of correct winner
// picks. Mirrored by the streak_family pg enum in apps/api's
// db/schema/streaks.ts.
export const STREAK_FAMILIES = [
	"winners",
	"team_stats",
	"player_stats",
	"numeric",
] as const
export type StreakFamily = (typeof STREAK_FAMILIES)[number]

// A Record for the same reason as SHAPE_SUBJECT above: a new shape fails the
// build until it's placed in a family or deliberately left out. Only
// game-scoped shapes have one. A season-long question settles months after
// it's called, so it has no place in a run ordered by when results landed,
// and yes_no_prop has no game to order it by at all.
export const STREAK_FAMILY_BY_SHAPE: Record<
	QuestionShape,
	StreakFamily | null
> = {
	team_vs_team: "winners",
	game_total_over_under: "team_stats",
	team_stat_over_under: "team_stats",
	player_stat_over_under: "player_stats",
	player_vs_player: "player_stats",
	player_game_stat_leader: "player_stats",
	player_stat_numeric_guess: "numeric",
	team_stat_numeric_guess: "numeric",
	yes_no_prop: null,
	player_season_stat_over_under: null,
	team_season_stat_over_under: null,
	player_vs_player_season: null,
	team_vs_team_season: null,
	player_season_award: null,
	team_season_award: null,
	player_award_finalists: null,
	team_season_stat_numeric_guess: null,
	player_season_stat_leader: null,
	player_team_season_stat_leader: null,
}

export function streakFamilyFor(shape: QuestionShape): StreakFamily | null {
	return STREAK_FAMILY_BY_SHAPE[shape]
}

export function shapesInFamily(family: StreakFamily): QuestionShape[] {
	return (Object.keys(STREAK_FAMILY_BY_SHAPE) as QuestionShape[]).filter(
		(shape) => STREAK_FAMILY_BY_SHAPE[shape] === family,
	)
}

export const STREAK_FAMILY_LABEL: Record<StreakFamily, string> = {
	winners: "Winners",
	team_stats: "Team Stats",
	player_stats: "Player Stats",
	numeric: "Number Guesses",
}

// A second, coarser grouping than the streak families above, and deliberately
// not the same one: streak families are about what a run of calls means
// ("winners" is its own track because calling games is its own skill), while
// these are the lines people already think along when reading a breakdown
// ("my over/unders", "my award calls"). A flat list of 19 shapes is
// unscannable, in a filter dropdown or in a report card's breakdown.
//
// SCREAMING_CASE, unlike StreakFamily's lowercase, because there's no pg enum
// behind this - nothing stores a shape family, it's derived on read - so the
// values match what the GraphQL enum and the web already use, and no layer
// has to translate.
export const SHAPE_FAMILIES = [
	"OVER_UNDER",
	"NUMERIC_GUESS",
	"HEAD_TO_HEAD",
	"STAT_LEADER",
	"AWARD",
	"YES_NO",
] as const

export type ShapeFamily = (typeof SHAPE_FAMILIES)[number]

// A Record rather than a Set-per-family, same reasoning as SHAPE_SUBJECT
// above: a set treats an omitted shape as "not in this family", so a newly
// added shape would silently vanish from the bottom of a filter and out of
// every breakdown. Every shape has to be filed somewhere deliberately, and
// failing the build is how that gets noticed. This is the one place the
// assignment lives - apps/web derives its own GraphQL-keyed copy from it
// rather than restating it.
export const SHAPE_FAMILY_BY_SHAPE: Record<QuestionShape, ShapeFamily> = {
	player_stat_over_under: "OVER_UNDER",
	team_stat_over_under: "OVER_UNDER",
	player_season_stat_over_under: "OVER_UNDER",
	team_season_stat_over_under: "OVER_UNDER",
	game_total_over_under: "OVER_UNDER",
	player_stat_numeric_guess: "NUMERIC_GUESS",
	team_stat_numeric_guess: "NUMERIC_GUESS",
	team_season_stat_numeric_guess: "NUMERIC_GUESS",
	player_vs_player: "HEAD_TO_HEAD",
	player_vs_player_season: "HEAD_TO_HEAD",
	team_vs_team: "HEAD_TO_HEAD",
	team_vs_team_season: "HEAD_TO_HEAD",
	player_game_stat_leader: "STAT_LEADER",
	player_season_stat_leader: "STAT_LEADER",
	player_team_season_stat_leader: "STAT_LEADER",
	player_season_award: "AWARD",
	team_season_award: "AWARD",
	player_award_finalists: "AWARD",
	yes_no_prop: "YES_NO",
}

export function shapeFamilyFor(shape: QuestionShape): ShapeFamily {
	return SHAPE_FAMILY_BY_SHAPE[shape]
}

export const SHAPE_FAMILY_LABEL: Record<ShapeFamily, string> = {
	OVER_UNDER: "Over/Under",
	NUMERIC_GUESS: "Numeric Guess",
	HEAD_TO_HEAD: "Head-to-Head",
	STAT_LEADER: "Stat Leader",
	AWARD: "Award",
	YES_NO: "Yes/No",
}

// What a shape is called wherever one is named in full: the create form's
// picker, a question filter, a report card's per-shape breakdown. Lives here
// rather than in apps/web because the API needs the same strings to render a
// share card - satori draws that PNG server-side with no browser anywhere, so
// "the client can label it" isn't available to it.
//
// _STAT_OVER_UNDER always names its scope explicitly (Game vs Season) -
// these two used to be one ambiguous shape with an optional game, which
// wasn't obvious from the picker and read as "leave it blank for season long"
// only once you were already deep in the form.
export const SHAPE_LABEL: Record<QuestionShape, string> = {
	player_stat_over_under: "Player Game Over/Under",
	team_stat_over_under: "Team Game Over/Under",
	player_season_stat_over_under: "Player Season Over/Under",
	team_season_stat_over_under: "Team Season Over/Under",
	game_total_over_under: "Combined Score Over/Under",
	player_stat_numeric_guess: "Player Game Numeric Guess",
	team_stat_numeric_guess: "Team Game Numeric Guess",
	team_season_stat_numeric_guess: "Team Season Numeric Guess",
	player_vs_player: "Player Game Head-to-Head",
	player_vs_player_season: "Player Season Head-to-Head",
	team_vs_team: "Team vs Team",
	team_vs_team_season: "Team Season Head-to-Head",
	player_game_stat_leader: "Game Stat Leader",
	player_season_stat_leader: "Player Season Multi-Way",
	player_team_season_stat_leader: "Team Stat Leader",
	yes_no_prop: "Yes/No",
	player_season_award: "Player Season Award",
	team_season_award: "Team Season Award",
	player_award_finalists: "Award Finalists",
}

// The compact category badge on a share card, which groups shapes more
// coarsely than SHAPE_LABEL above - a share card is a tiny image, not a
// picker card, and several shapes collapse onto one badge here.
//
// Shared for the same reason SHAPE_LABEL is, and this pair had the sharper
// need: the exported PNG (api's lib/share-cards) and the resolution digest
// email both render server-side, while the call page renders the same badge
// in the browser. All three are the same claim about the same call arriving
// in three places, and until now the strings lived in two hand-synced copies
// that had already drifted once - team_season_stat_numeric_guess and
// player_game_stat_leader were silently falling back to "Other" on every
// share card.
export const SHARE_CARD_SHAPE_LABEL: Record<QuestionShape, string> = {
	player_stat_over_under: "Player Stat",
	team_stat_over_under: "Team Stat",
	player_season_stat_over_under: "Season Stat",
	team_season_stat_over_under: "Season Stat",
	game_total_over_under: "Combined Score",
	player_stat_numeric_guess: "Player Stat",
	team_stat_numeric_guess: "Team Stat",
	team_season_stat_numeric_guess: "Season Stat",
	player_vs_player: "Head-to-Head",
	player_vs_player_season: "Head-to-Head",
	team_vs_team: "Game Outcome",
	team_vs_team_season: "Head-to-Head",
	player_game_stat_leader: "Stat Leader",
	// Not "Stat Leader" like the game-scoped shape above, which really is a
	// leaderboard over both full rosters. This one ranks a creator-named
	// handful, and a badge reading "Stat Leader" on a share card - where
	// there's no picker description to correct it - invites the league-wide
	// reading the shape's title works to rule out.
	player_season_stat_leader: "Multi-Way",
	// The whole roster, so unlike the curated pool above it really is a
	// leaderboard.
	player_team_season_stat_leader: "Team Leader",
	yes_no_prop: "Yes/No",
	player_season_award: "Season Award",
	team_season_award: "Season Award",
	player_award_finalists: "Season Award",
}

// A sweep is every game in a slate called right; below this many games a
// slate is too small for that to mean much.
export const SWEEP_MIN_GAMES = 3
// The shortest run a call's streak tag is shown for.
export const STREAK_TAG_MIN = 3
// The shortest streak worth listing on a group's highlights or a profile.
// Same number on both sides today, but they're worth tuning apart: calling
// someone cold sooner than you call them hot is a product choice.
export const HOT_STREAK_MIN = 3
export const COLD_STREAK_MIN = 3
// A run of one isn't a streak, so a track with nothing longer has no page.
export const LISTED_STREAK_MIN = 2

// Which side of a track a page or its og:image leads with.
export type StreakMode = "hot" | "cold"

// A track can hold both a run worth showing and a cold streak worth showing,
// and which one a visitor expects depends on the link they followed: a "best
// streaks" row and a "cold streaks" row can name the same track, since a best
// run of 6 says nothing about missing the last 4. So a link states the side it
// meant, and only a link that didn't state one falls back to whichever side is
// live. Null when neither side clears its floor, which is the page's
// not-found.
export function resolveStreakMode(
	track: {
		currentLength: number
		bestLength: number
		currentColdLength: number
		worstColdLength: number
	},
	requested?: StreakMode | null,
): StreakMode | null {
	const hot = track.bestLength >= LISTED_STREAK_MIN
	const cold = track.worstColdLength >= COLD_STREAK_MIN
	if (!hot && !cold) return null
	// An asked-for side that has nothing to show falls through to the other
	// rather than 404ing, so a stale link still lands on the track.
	if (requested === "cold") return cold ? "cold" : "hot"
	if (requested === "hot") return hot ? "hot" : "cold"
	if (track.currentLength > 0) return "hot"
	if (track.currentColdLength >= COLD_STREAK_MIN && cold) return "cold"
	return hot ? "hot" : "cold"
}
// Streak notifications fire at every multiple of this length.
export const STREAK_MILESTONE_STEP = 5
// The shortest run a personal best or a snapped streak is worth telling
// anyone about.
export const STREAK_NOTIFY_MIN = 5

// The run lengths that earn a flair, one per entry. Deliberately sparser than
// STREAK_MILESTONE_STEP above: a notification every five is a nudge you read
// once, but a flair is worn until you swap it, so the bar to earn a new one
// has to climb. The api's flair catalog builds its "streak:N" keys straight
// off this array, so adding a number here is the whole change.
export const STREAK_FLAIR_THRESHOLDS = [5, 10, 25] as const

// Every this many wins in a row on one streak track pays a bonus, on the
// same beat as the milestone notification so the points land with the
// announcement.
export const STREAK_BONUS_STEP = STREAK_MILESTONE_STEP
// The bonus is this share of what the STREAK_BONUS_STEP wins that got there
// committed, rather than a flat amount. A flat bonus would be the same for a
// run of minimum-conviction chalk as for a run someone stood behind, and would
// make stacking tiny calls the best way to earn it. Committed rather than
// scored, because each win's contrarian tier and earliness are already paid
// on the win itself - a share of the scored points would pay them twice.
export const STREAK_BONUS_SHARE = 0.2
// A sweep pays this share of what its winner calls committed, for the same
// reasons. A bigger slate already pays more, since it holds more calls.
export const SWEEP_BONUS_SHARE = 0.2

export function shareOfPoints(points: number, share: number): number {
	return Math.round(points * share)
}

// The over/under family. Every one of these pairs a stat with a line the
// result lands on one side of, which is what makes them share an option label
// format ("Over 224.5") and a "set the number" field in the create form.
//
// Here rather than at each site for the same reason as the two sets around it:
// this list is already duplicated in apps/web (question-labels.ts holds an
// uppercase-GraphQL copy, use-cast-call-form.ts a lowercase one), which is
// exactly the drift those comments warn about.
export const OVER_UNDER_SHAPES = new Set<QuestionShape>([
	"player_stat_over_under",
	"team_stat_over_under",
	"player_season_stat_over_under",
	"team_season_stat_over_under",
	"game_total_over_under",
])

export function isOverUnderShape(shape: QuestionShape): boolean {
	return OVER_UNDER_SHAPES.has(shape)
}

// The shapes with exactly two options, where every call is on one of two
// sides - which is what a fade needs, since fading a call means taking the
// other side of it. Derived from the family rather than listed, so a new
// shape is two-sided only by being filed into one of these families.
const TWO_SIDED_FAMILIES = new Set<ShapeFamily>([
	"OVER_UNDER",
	"HEAD_TO_HEAD",
	"YES_NO",
])

export function isTwoSidedShape(shape: QuestionShape): boolean {
	return TWO_SIDED_FAMILIES.has(shapeFamilyFor(shape))
}

// The shapes scored off calls.guessValue rather than an options row - a
// caller types a number and is scored on how close it lands, so they have no
// options to select and every "does this question have a numeric guess on it"
// branch keys off this. Lives here rather than as an inline shape comparison
// at each site because the set has grown since the first two members
// (team_season_stat_numeric_guess came later), and a hand-copied list is
// exactly how one of those sites ended up still checking only the original
// pair.
export const NUMERIC_GUESS_SHAPES = new Set<QuestionShape>([
	"player_stat_numeric_guess",
	"team_stat_numeric_guess",
	"team_season_stat_numeric_guess",
])

export function isNumericGuessShape(shape: QuestionShape): boolean {
	return NUMERIC_GUESS_SHAPES.has(shape)
}

// An option's share of the field, as of however many calls exist right now.
// Used both for the live "X% of the field agrees" preview and, once a
// question resolves, for scoring - same formula either way, so the number
// shown while a question is open and the number it's actually scored against
// at lock can never drift apart.
export function fieldPct(optionCallCount: number, totalCalls: number): number {
	if (totalCalls === 0) return 0
	return (optionCallCount / totalCalls) * 100
}

export type ContrarianTier = { mult: number; label: string }

// The floor/ceiling of "how rare was being right" - shared by tierFor below
// AND numericGuessPoints further down, which reuses tierFor directly rather
// than maintaining its own separate range. Exported so nothing importing
// either has to hand-copy a literal 1/6 that could silently drift from this.
export const TIER_MIN_MULT = 1
export const TIER_MAX_MULT = 6

const TIER_SATURATION_RARITY = 1 / 50
const TIER_CURVE_EXPONENT =
	Math.log(TIER_MAX_MULT) / -Math.log(TIER_SATURATION_RARITY)

// The share of the field an option would hold if the field called it exactly
// as often as it's expected to hit. A side the question priced (a two-sided
// question with a model behind it, see sidePrice) is expected at the model's
// chance it hits. Everything else is expected at an even split, since nothing
// says one option is likelier than another.
export function expectedFieldShare(
	totalOptions: number,
	modelHitRate?: number | null,
): number {
	if (modelHitRate != null) return modelHitRate
	return totalOptions > 0 ? 1 / totalOptions : 1
}

// relativeRarity is this option's share of the field divided by its expected
// share (see expectedFieldShare), so the same 5% reads as lopsided on a binary
// question but as unremarkable on a 20-option one. On a priced side it pays
// only for how far the field underrated the side beyond what its price
// already accounts for: an underdog the model gives 25%, called by 25% of
// the field, is 1x, because its bigger win (see sidePrice) already
// pays for that risk.
// mult = clamp(relativeRarity^-k, 1, 6): the expected share or more pays 1x,
// and every step under it pays more. k is solved so the ceiling lands at
// 1/50th of the expected share. Unpriced binary points: 50%->1.0, 33%->1.20,
// 22%->1.45, 20%->1.52, 10%->2.09, 5%->2.87, 2%->4.37, 1%->6.0.
// relativeRarity -> 0 (nobody else picked it, or division by zero when nobody
// did) ceilings to 6.
//
// fieldPct here is the option's FINAL share of the field, computed once at
// resolution and applied to every selection on that option - not a
// per-caller snapshot. Snapshotting at call time would reward whoever
// happened to call first with a bigger multiplier regardless of whether
// their pick actually turned out to be contrarian, since an early snapshot
// reflects a tiny, still-forming field rather than real consensus. There's
// also no gaming risk in waiting: nothing in this app lets a caller resubmit
// to chase a better number once it exists.
export function tierFor(
	fieldPct: number,
	totalOptions: number,
	modelHitRate?: number | null,
): ContrarianTier {
	const relativeRarity =
		fieldPct / 100 / expectedFieldShare(totalOptions, modelHitRate)
	const mult = Math.min(
		TIER_MAX_MULT,
		Math.max(TIER_MIN_MULT, relativeRarity ** -TIER_CURVE_EXPONENT),
	)
	return { mult, label: tierLabel(mult) }
}

// Bucketed purely for display (badges like "FEARLESS") - never used in point
// math. Bands are by multiplier, so a label means the same payout bump
// regardless of option count.
function tierLabel(mult: number): string {
	if (mult < 1.25) return "SAFE"
	if (mult < 2) return "STEADY"
	if (mult < 3.25) return "BOLD"
	if (mult < 5) return "DARING"
	return "FEARLESS"
}

export type EarlyTier = { mult: number; label: string }

// The ceilings of earlyTierFor and seasonEarlyTierFor below. Both floor at 1:
// being early only ever adds.
export const EARLY_MAX_MULT = 2
export const SEASON_EARLY_MAX_MULT = 3

// A second, independent multiplier from the contrarian tier above - being
// early and being contrarian aren't the same thing (you can call the eventual
// favorite on day one, or call a pick that stays a minority the whole way
// through without ever being early). rank/totalCalls is the call's position
// in the field's final call order, not clock time - a question that goes
// viral in an hour makes "day one" fully informed, while a slow-burn one
// keeps "day five" nearly as blind as day one, so raw time isn't the right
// proxy for how little crowd signal existed when you called.
//
// Continuous version of what used to be a 4-band lookup table (STANDARD/
// AHEAD OF THE CURVE/EARLY/FIRST MOVER at flat percentile cutoffs of 50/25/
// 10%), for the same reason as tierFor above: flat cutoffs mean a cliff right
// at each boundary (10th vs 11th percentile swung the bonus 33%) for no real
// difference in how early the call was. mult = clamp(percentile^-0.301, 1, 2)
// was fit against the old table's anchor points and reproduces them closely:
// 10th->2.0, 25th->1.52 (was 1.5), 50th->1.23 (was 1.2), 100th->1.0.
//
// Deliberately a much smaller range than the contrarian tier (1x-2x vs
// 1x-6x): being early already tends to correlate with ending up contrarian
// (the crowd hasn't converged into a consensus yet), so stacking two full
// 1x-6x multipliers would reward the same underlying behavior twice and blow
// the ceiling out to 36x. Same as the contrarian tier, this only ever
// multiplies the win side (see selectionPoints/numericGuessPoints below) -
// it can't be farmed by calling early and often, since a wrong call still
// eats the full flat loss regardless of when it was made.
export function earlyTierFor(rank: number, totalCalls: number): EarlyTier {
	if (totalCalls === 0) return { mult: 1, label: "STANDARD" }
	const percentile = rank / totalCalls
	const mult = Math.min(EARLY_MAX_MULT, Math.max(1, percentile ** -0.301))
	return { mult, label: earlyLabel(mult) }
}

// Bucketed purely for display, same reasoning as tierLabel above - thresholds
// sit at the midpoints between the old table's fixed values (1, 1.2, 1.5, 2).
function earlyLabel(mult: number): string {
	if (mult < 1.1) return "STANDARD"
	if (mult < 1.35) return "AHEAD OF THE CURVE"
	if (mult < 1.75) return "EARLY"
	return "FIRST MOVER"
}

// Season-long replacement for earlyTierFor above - same "how little real
// signal existed when this call was made" question, but for season-long
// shapes rank-among-callers is a poor proxy (call volume doesn't track
// season progress evenly - a slow trickle of calls across a whole season
// doesn't mean caller #3 knew as little as caller #3 on a game that fills up
// in an hour). elapsedPct here is games actually played so far divided by
// total games scheduled in the window this question was open for (season
// start through this question's own locksAt - see the caller in
// resolveQuestionInternal for how that window is built) - not calendar
// days, which don't track how much real on-field information exists.
//
// mult = clamp(elapsedPct^-0.477, 1, 3): continuous power curve, same family
// as tierFor/earlyTierFor above, fit against two anchor points - 10% of the
// window played -> 3.0 (the ceiling; mirrors earlyTierFor's own use of the
// 10th percentile as its saturation point) and 100% played -> 1.0 (the
// floor, exact by construction: 1^-k = 1 for any k). Some other points this
// produces: 25%->1.94, 50%->1.39, 75%->1.15.
//
// Deliberately a smaller range than the contrarian tier but slightly wider
// than rank-based earliness (1x-3x vs 1x-2x) - being early in a season is a
// bigger informational gap than being early among same-day callers on one
// game (a whole season's worth of injuries/form/matchups is still unknown
// at 10%, not just a few hours of other people's opinions), but it still
// shouldn't stack with the contrarian tier's 1x-6x range to swing the total
// past what earlyTierFor already caps out at for game-scoped shapes.
//
// totalGames guarded against 0 (nothing synced yet for this window) -
// treated as elapsedPct 0 (fully preseason) rather than NaN, same spirit as
// fieldPct's totalCalls===0 guard.
export function seasonEarlyTierFor(
	gamesPlayed: number,
	totalGames: number,
): EarlyTier {
	const elapsedPct = totalGames === 0 ? 0 : gamesPlayed / totalGames
	const mult =
		elapsedPct === 0
			? SEASON_EARLY_MAX_MULT
			: Math.min(SEASON_EARLY_MAX_MULT, Math.max(1, elapsedPct ** -0.477))
	return { mult, label: seasonEarlyLabel(mult) }
}

// Bucketed purely for display, same reasoning as earlyLabel above -
// thresholds sit at the midpoints between the curve's own anchor values (1,
// 1.39, 1.94, 3).
function seasonEarlyLabel(mult: number): string {
	if (mult < 1.2) return "STANDARD"
	if (mult < 1.65) return "EARLY SEASON"
	if (mult < 2.5) return "FIRST QUARTER"
	return "PRESEASON"
}

// conviction is 1-100, how much of the tier's payout is actually in play.
// What a caller puts up on a pick: the committed points, before any
// multiplier and before the loss rate. Not what a miss costs (that's
// pointsAtStake below) and not what a hit pays (that's committed x tier x
// early) - it's the size of the call itself, which is the only one of the
// three that's fixed the moment the call is made and identical on both
// sides. The report card divides by it, so a shape that pays 4x its stake on
// a hit can't dominate a grade purely by risking little.
export function pointsCommitted(
	basePoints: number,
	conviction: number,
): number {
	return Math.round(basePoints * (conviction / 100))
}

// What a miss costs, as a positive number - the callers that want it negative
// negate it themselves. Extracted because this expression had FOUR copies:
// the two payout functions below and the two previews in apps/web's
// lib/scoring.ts, which had already drifted apart in sign convention (the
// previews returned it positive, the payouts negative). A miss's cost is the
// one number a caller knows exactly when they commit, so it has to be
// computed the same way everywhere it's shown or paid.
export function pointsAtStake(
	basePoints: number,
	lossRate: number,
	conviction: number,
): number {
	return Math.round(basePoints * (conviction / 100) * lossRate)
}

// A community question's difficulty is whatever its creator writes, with no
// house pricing behind it, so it's worth a bit less than an official one at
// the same conviction. Scaled on the base rather than by capping conviction,
// so the full 1-100 range still says how sure the caller is.
export const COMMUNITY_POINTS_MULT = 0.8

// The base every payout, stake and committed figure for a question starts
// from. Not a stored column: it only ever depends on these two facts, which
// never change after creation.
export function basePointsFor(question: {
	shape: QuestionShape
	isOfficial: boolean
}): number {
	const base = BASE_POINTS_BY_SHAPE[question.shape]
	return question.isOfficial ? base : base * COMMUNITY_POINTS_MULT
}

export type PointsPreview = {
	win: number
	lose: number
	// The side's own price on a hit (see sidePrice), 1 on an unpriced side.
	winMult: number
	tier: ContrarianTier
	earlyTier: EarlyTier
}

// A priced option's side of SidePrice plus the model's chance behind it, as
// stored on questionOptions. Every field is null on an unpriced option, which
// pays 1x on a hit and is expected at an even split of the field.
export type OptionPricing = {
	modelHitRate?: number | null
	winMult?: number | null
}

// What an unsettled option pick pays if right and costs if wrong - both
// outcomes at once, since which one applies isn't known until resolution.
// Shared by the web's live preview while picking and the API's Call.payout,
// so a pick shows the same pair of numbers before and after it's made.
// earlyTier is caller-computed (earlyTierFor for game-scoped shapes,
// seasonEarlyTierFor for season-long ones - see isSeasonLongShape) since
// which formula applies depends on the shape. Omitting it leaves the early
// multiplier at 1x, which is also the right read before a call exists.
// `pricing` is the option's own (see OptionPricing).
export function previewSelectionPoints(
	basePoints: number,
	lossRate: number,
	fieldPct: number,
	totalOptions: number,
	conviction: number,
	earlyTier: EarlyTier = { mult: 1, label: "STANDARD" },
	pricing: OptionPricing = {},
): PointsPreview {
	const stake = conviction / 100
	const tier = tierFor(fieldPct, totalOptions, pricing.modelHitRate)
	const winMult = pricing.winMult ?? 1
	return {
		win: Math.round(basePoints * stake * winMult * tier.mult * earlyTier.mult),
		lose: pointsAtStake(basePoints, lossRate, conviction),
		winMult,
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

// A numeric guess pays out on the same "how rare was being right" curve as
// every other shape (see numericGuessPoints), where rare means few people,
// out of the whole field, landed at least as close to the actual value. That
// share can't be known before resolution, so this reports the full possible
// range instead of one number. A miss is a flat loss of the stake at the
// loss rate, same as every other shape. earlyRank/earlyTotalCalls follow the
// same optional-before-a-call-exists rule as previewSelectionPoints above.
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

// basePoints comes from BASE_POINTS_BY_SHAPE and lossRate from
// LOSS_RATE_BY_SHAPE for this question's shape.
// earlyMult comes from earlyTierFor, computed by the caller from the call's
// (not the selection's) position in the field - a player_season_award/
// team_season_award call has several selections made at the same instant, so
// earliness is a property of the call, not of any one pick within it.
// `pricing` is the option's own (see OptionPricing).
export function selectionPoints(
	basePoints: number,
	lossRate: number,
	optionFieldPct: number,
	totalOptions: number,
	conviction: number,
	isCorrect: boolean,
	earlyMult: number,
	pricing: OptionPricing = {},
): number {
	if (!isCorrect) return -pointsAtStake(basePoints, lossRate, conviction)
	return Math.round(
		basePoints *
			(conviction / 100) *
			(pricing.winMult ?? 1) *
			tierFor(optionFieldPct, totalOptions, pricing.modelHitRate).mult *
			earlyMult,
	)
}

// Which of a stat's two tolerance interpretations applies - see
// toleranceMode in db/schema/stats.ts. "percentage" is a counting stat
// (rebounds, yards): the band is a fraction of the actual result. "absolute"
// is a rate stat (batting average, ERA): a percentage-of-value band makes no
// sense on a 0-1ish scale, so the band is a fixed amount in the stat's own
// unit instead.
export type ToleranceSpec =
	| { mode: "percentage"; pct: number }
	| { mode: "absolute"; amount: number }

// Floored, not rounded to nearest - nearest would sometimes make the actual
// band more forgiving than the percentage it came from (1.8 rounding up to
// 2 is a quietly better deal than the 15% that was promised). Floor can only
// match or undercut the raw percentage, never inflate it. Floored to a
// minimum of 1 rather than 0 - a low-count stat (blocks, steals) shouldn't
// require an exact guess just because the percentage math rounds a small
// number down to nothing. Neither the flooring nor the min-1 applies in
// absolute mode - the configured amount is already in the stat's real unit
// (and may legitimately be under 1, e.g. +/-0.02 for batting average), not a
// percentage that needs converting into one.
//
// Exported (not module-local) and used for both sides of a guess - the real
// hit/miss check below (off the actual result) and the client's live preview
// while picking (off the guess itself, since the actual isn't known yet) -
// so the two can't silently drift into different formulas the way they once
// did.
export function toleranceBand(value: number, spec: ToleranceSpec): number {
	if (spec.mode === "absolute") return spec.amount
	return Math.max(1, Math.floor(Math.abs(value * spec.pct)))
}

export function hitTolerance(
	guessValue: number,
	actualValue: number,
	spec: ToleranceSpec,
): boolean {
	const band = toleranceBand(actualValue, spec)
	return Math.abs(guessValue - actualValue) <= band
}

// The tolerance band is the real win/loss line, same as picking the correct
// option elsewhere - without a genuine downside for missing it, the two
// numeric-guess shapes would be a strictly better bet than every other shape
// (upside with none of the risk), and callers would only ever answer these.
// A miss loses the stake at the shape's LOSS_RATE_BY_SHAPE rate, flat - no
// multiplier touches it, same as a wrong option pick. That line
// stays a hard binary on purpose - every other shape's win/loss is binary too
// (you picked the correct option or you didn't), and softening it into a
// decaying "almost right still counts a little" would make numeric-guess
// shapes the one place wrong is negotiable, undermining the same "being
// wrong has to actually show up" principle the rest of the scoring model
// leans on.
//
// A hit's multiplier reuses tierFor - "hit" vs "miss" is a binary outcome
// (totalOptions=2), the same shape as a yes_no pick - fed a share computed
// against the WHOLE field, not just other hitters: what fraction of every
// caller (hit or miss) landed at least as close to the actual value as this
// guess did. Only other hits can ever count toward that share (a miss is by
// definition farther away than the tolerance band, which is always >= any
// hit's distance), but sizing it against totalCalls rather than just the hit
// count is what makes it meaningful: being the closest of 3 hitters reads as
// rare when there were 40 total guessers, and NOT rare when there were only
// 4. It also naturally prices in how "obvious" a guess was - if a big chunk
// of the field converges on the same close answer (a low-count stat like
// steals, where half the field might correctly guess 1), everyone tied at
// that distance shares a large, unremarkable share and scores near the
// floor, same as a popular option pick landing in the SAFE tier. This
// replaced an earlier version that ranked purely by distance among hitters,
// which had exactly the two problems above: a thin hit count read as rare
// regardless of the total field size, and there was no way for an "everyone
// guessed the obvious number" hit to score any differently than a genuinely
// rare exact guess.
// basePoints comes from BASE_POINTS_BY_SHAPE and lossRate from
// LOSS_RATE_BY_SHAPE for whichever numeric-guess shape this is.
export function numericGuessPoints(
	basePoints: number,
	lossRate: number,
	guesses: {
		callId: string
		guessValue: number
		conviction: number
		createdAt: Date
	}[],
	actualValue: number,
	spec: ToleranceSpec,
): {
	callId: string
	points: number
	hit: boolean
	closenessMult: number | null
	closenessFieldPct: number | null
}[] {
	const withHit = guesses.map((guess) => ({
		...guess,
		hit: hitTolerance(guess.guessValue, actualValue, spec),
		distance: Math.abs(guess.guessValue - actualValue),
	}))

	// Same rank/totalCalls earliness as the option-based shapes - see
	// earlyTierFor above - just computed off createdAt directly since every
	// numeric-guess call is its own single guess (no separate selections).
	const totalCalls = guesses.length
	const orderedByTime = [...guesses].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	)
	const earlyMultByCallId = new Map(
		orderedByTime.map((guess, index) => [
			guess.callId,
			earlyTierFor(index + 1, totalCalls).mult,
		]),
	)

	// closenessMult and closenessFieldPct are both returned per call (not just
	// folded into the final points) so they can be persisted at resolution -
	// same reasoning as selectionPoints not being the only thing stored for a
	// selection: the client needs the actual multiplier AND the raw share it
	// came from, not just the number it produced, or it has no way to show
	// real "why these points" math (or "why this multiplier") after the fact.
	const hits = withHit.filter((guess) => guess.hit)
	const closenessByCallId = new Map(
		hits.map((guess) => {
			const atLeastAsClose = hits.filter(
				(other) => other.distance <= guess.distance,
			).length
			const sharePct = (atLeastAsClose / totalCalls) * 100
			return [
				guess.callId,
				{ mult: tierFor(sharePct, 2).mult, sharePct },
			] as const
		}),
	)
	const pointsByCallId = new Map(
		hits.map((guess) => {
			const mult = closenessByCallId.get(guess.callId)?.mult ?? TIER_MIN_MULT
			const stake = guess.conviction / 100
			const earlyMult = earlyMultByCallId.get(guess.callId) ?? 1
			return [
				guess.callId,
				Math.round(basePoints * stake * mult * earlyMult),
			] as const
		}),
	)

	return withHit.map((guess) => ({
		callId: guess.callId,
		hit: guess.hit,
		closenessMult: guess.hit
			? (closenessByCallId.get(guess.callId)?.mult ?? null)
			: null,
		closenessFieldPct: guess.hit
			? (closenessByCallId.get(guess.callId)?.sharePct ?? null)
			: null,
		points: guess.hit
			? (pointsByCallId.get(guess.callId) ?? 0)
			: -pointsAtStake(basePoints, lossRate, guess.conviction),
	}))
}

// How many resolved picks a record needs before its conviction edge means
// anything. Under this the two-sided average swings wildly on a single pick -
// a three-call record reading -47 says nothing about the caller. Lives here
// rather than in the API so the web can render the locked state's "N more to
// unlock" hint off the same number the API gates on.
export const MIN_EDGE_SAMPLE = 20

// How many unspent redos a wallet holds at once. The cap is on the stock, not
// on earning: a referral that qualifies while the wallet is full waits in a
// queue and is granted the moment one is spent. So this bounds hoarding -
// nobody walks into a slate holding eight do-overs - without ever closing the
// loop on someone who keeps inviting people.
//
// Lives here rather than in the API so the web can render "3 of 3, spend one
// to bank another" off the same number the API gates on.
export const REDO_BALANCE_CAP = 3

// The ceiling on referrals one account can convert to redos in a season.
//
// Set where no real user reaches it. Ten people who sign up AND make a call is
// a k-factor far above 1, and a product doing that is growing rather than
// being farmed. So this is a circuit breaker against a scripted farm, not a
// product limit: the only cap a genuine user ever feels is REDO_BALANCE_CAP.
// Tune it against the abuse review, never against engagement - real users
// hitting it is a reason to raise it, not evidence it is working.
export const REFERRAL_SEASON_CAP = 10

// Does a caller put more weight behind the picks they hit than the ones they
// miss? Accuracy answers "were you right"; this answers "did you know when
// you were right". Positive means your loudest calls are your best ones,
// negative means they're your worst, and zero means conviction carries no
// information about the outcome.
//
// Deliberately a difference of averages rather than a probability score
// (Brier, log loss): those read conviction as a stated likelihood, but the
// product presents it as a stake - "conviction just decides how much of it is
// in play" - so grading a caller against a meaning the slider never claimed
// would be scoring them on a question they weren't asked. A difference of
// averages is purely relative, so it holds up whether a caller sets
// conviction by belief or by appetite.
//
// Orthogonal to accuracy on purpose, not a replacement for it: a 30%-accurate
// caller can post a strong edge, and should - being wrong often while knowing
// which ones you'll be wrong about is a real skill the points total alone
// never shows.
//
// Null rather than zero when one side has no samples - an all-hits or
// all-misses record has nothing to subtract, which is a different statement
// than "conviction told us nothing".
export function convictionEdge(summary: {
	resolvedCallCount: number
	correctCount: number
	convictionSum: number
	convictionSumCorrect: number
}): number | null {
	const wrongCount = summary.resolvedCallCount - summary.correctCount
	if (summary.resolvedCallCount < MIN_EDGE_SAMPLE) return null
	if (summary.correctCount === 0 || wrongCount === 0) return null
	const sumWrong = summary.convictionSum - summary.convictionSumCorrect
	return (
		summary.convictionSumCorrect / summary.correctCount - sumWrong / wrongCount
	)
}

// How far a resolved call landed from its line, and whether that was
// remarkable. Split out from the scoring math above: it describes a result,
// it doesn't score one. Nothing above imports it - see the header
// comment in ./margin.ts for why that separation is load-bearing.
export {
	type CallMargin,
	callMargin,
	FALLBACK_TOLERANCE_SPEC,
	MARGIN_THRESHOLDS,
	type MarginBasis,
	type MarginVerdict,
} from "./margin"

// How a whole window of calls is graded, for the report card. Same separation
// as ./margin above - it reads a set of results, never decides
// what any one call is worth, and nothing above imports it.
export {
	type CalendarLevel,
	type CalendarSide,
	calendarSteps,
	calendarTone,
	callReturnVariance,
	GRADE_BANDS,
	type Grade,
	gradeForReturn,
	REPORT_CARD_MIN_SETTLED,
	returnOnCommitted,
	returnScore,
	returnStandardError,
} from "./report-card"
