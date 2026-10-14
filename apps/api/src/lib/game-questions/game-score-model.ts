import { sidePrices } from "@called-my-shot/scoring"
import { sql } from "drizzle-orm"
import { db } from "../../db"
import { GAME_QUESTION_CATALOG } from "../../db/catalog/game-question-catalog"
import type { Game, Team } from "../../db/schema"
import { defaultEspnClient, type EspnClient } from "../../db/sync/espn-client"
import { createEspnRequester } from "../../db/sync/espn-requester"
import { SYNCED_LEAGUES } from "../../db/sync/leagues"
import { loadEspnIds } from "../../db/sync/sync-refs"
import { teamScoreBoxSpread } from "./box-spread"
import {
	type DuelSpread,
	duelSpreadFor,
	isPaired,
	PRICING_MIN_SAMPLE,
	type PricedSide,
	priceDuel,
	withBoxSpread,
} from "./duel-pricing"
import { LINE_TUNING, median } from "./line-calibration"
import { openLineRangeOf, type PricedLine, withTimeout } from "./line-pricing"
import {
	isGeneratedOverUnder,
	loadLineSettings,
	type OverUnderTemplate,
	withLineSettings,
} from "./line-settings"
import {
	blendSamples,
	LINE_FORMULA,
	type LineBasis,
	type LineFormula,
	type OpponentAdjustment,
	type SeasonSample,
} from "./lines"
import {
	createSeasonTableCache,
	createStandingsCache,
	createTeamSeasonStatsCache,
	homeEdge,
	opponentFor,
	teamSamples,
	teamScoresFrom,
} from "./team-lines"

// One model of a game's two final scores, which every question about them
// reads from: each team's score over/under, the game total, and who wins.
// Each team's expected score is set once - its blended scoring, moved by the
// other side's defense - and past games' results against their own
// expectations are replayed at this game's two expectations. With enough past
// games that carry both sides, each one is replayed whole, so whatever moved
// both scores at once (a pitchers' duel, a shootout, the home side's edge)
// stays in. Short of that, each side is drawn from the spread on its own and
// moved by the season's measured home edge (see homeEdge).
//
// A line is the half point where the over comes closest to landing half the
// time across those replayed games, and the chance it does is kept with it.
// Because the team lines, the total and the who-wins price are all read off
// the same replayed games, they can't disagree about how the game goes: a low
// team line on both sides comes with a low total.
//
// The spread is read from regular-season games only. A postseason plays to a
// different scoring level, which the spread would otherwise pick up as
// noise around the regular season's expectations; instead the level is
// measured on its own (see postseasonFactor) and applied to the expectations.

export type ScoreSide = "away" | "home"

// One team's expected score, and everything it was set from.
export type ModelSide = {
	season: SeasonSample | null
	prior: SeasonSample | null
	blended: SeasonSample
	// Null when the other side's defense couldn't be read, or couldn't be read
	// on both sides (a sum of one adjusted side and one bare one is neither
	// model, so then neither side is adjusted).
	opponent: OpponentAdjustment | null
	expected: number
}

export type GameScoreModel = {
	// The stat the model's scores are in: the league's team score over/under
	// template's, so only questions on that same stat read from it.
	templateId: string
	statName: string
	away: ModelSide
	home: ModelSide
	formula: LineFormula
	priorWeight: number
	spread: DuelSpread
	// What each side's expectation is moved by when the spread has too few
	// same-game pairs to carry the home edge itself. Both 1 when it does.
	edge: { home: number; away: number }
	// What both expectations were multiplied by for the scoring level this
	// part of the season plays to. 1 in the regular season.
	scoringFactor: number
}

const roundToThousandths = (value: number) => Math.round(value * 1000) / 1000

// One side's score in every replayed game.
export function sideDraws(model: GameScoreModel, side: ScoreSide): number[] {
	const expected = model[side].expected
	if (isPaired(model.spread)) {
		return model.spread.pairs.map((pair) => pair[side] * expected)
	}
	const edge = model.edge[side]
	return model.spread.ratios.map((ratio) => ratio * expected * edge)
}

// Both sides' scores added together in every replayed game. Without enough
// same-game pairs every pairing of two past results is a plausible game, the
// same way duelProbability reads them.
export function totalDraws(model: GameScoreModel): number[] {
	const away = model.away.expected
	const home = model.home.expected
	if (isPaired(model.spread)) {
		return model.spread.pairs.map(
			(pair) => pair.away * away + pair.home * home,
		)
	}
	const awayScores = model.spread.ratios.map(
		(ratio) => ratio * away * model.edge.away,
	)
	const homeScores = model.spread.ratios.map(
		(ratio) => ratio * home * model.edge.home,
	)
	return awayScores.flatMap((a) => homeScores.map((h) => a + h))
}

// The chance a result lands over `line`, smoothed by half a draw on each side
// like overProbability, so no line reads as certain.
export function chanceOver(draws: number[], line: number): number {
	const over = draws.filter((draw) => draw > line).length
	return (over + 0.5) / (draws.length + 1)
}

export type ModelLine = { line: number; pOver: number }

// The half point nearest an even chance. The median of the draws is the even
// point itself, but a line has to sit on a half so it can't push, and on a
// low-scoring stat the half above and the half below a whole-number median
// can be ten points of chance apart. So the halves around it are each
// measured and the one closest to even wins. Null when every candidate falls
// under the template's floor.
export function lineFromDraws(
	draws: number[],
	minLine: number,
): ModelLine | null {
	const middle = median(draws)
	if (middle === null) return null
	const whole = Math.floor(middle)
	let best: ModelLine | null = null
	for (const line of [whole - 0.5, whole + 0.5, whole + 1.5]) {
		if (line < minLine) continue
		const pOver = chanceOver(draws, line)
		if (!best || Math.abs(pOver - 0.5) < Math.abs(best.pOver - 0.5)) {
			best = { line, pOver }
		}
	}
	return best && { line: best.line, pOver: roundToThousandths(best.pOver) }
}

// Who wins, away side first, priced from the same replayed games the lines
// are read from.
export function priceWinner(
	model: GameScoreModel,
): [PricedSide, PricedSide] | null {
	return priceDuel(
		model.spread,
		model.away.expected * model.edge.away,
		model.home.expected * model.edge.home,
	)
}

// What a team's line was set from, filed the way setLine files one so
// calibration reads it back the same way. A model line has no shade: its
// chance of going over is stored instead.
export function teamLineBasis(
	model: GameScoreModel,
	side: ScoreSide,
	picked: ModelLine,
): LineBasis {
	const { season, prior, blended, opponent, expected } = model[side]
	return {
		seasonMean: season ? roundToThousandths(season.mean) : null,
		seasonGames: season?.games ?? 0,
		priorMean: prior ? roundToThousandths(prior.mean) : null,
		priorGames: prior?.games ?? 0,
		priorWeight: model.priorWeight,
		blendedMean: roundToThousandths(blended.mean),
		expectedMean: roundToThousandths(expected),
		opponent,
		formula: model.formula,
		scoringFactor: model.scoringFactor,
		pOver: picked.pOver,
		line: picked.line,
	}
}

// A game total's basis: both sides' figures summed, as setTotalLine stores
// them.
export function totalLineBasis(
	model: GameScoreModel,
	picked: ModelLine,
): LineBasis {
	const sides = [model.away, model.home]
	const sumOf = (pick: (side: ModelSide) => SeasonSample | null) => {
		const [x, y] = sides.map(pick)
		return x && y ? roundToThousandths(x.mean + y.mean) : null
	}
	return {
		seasonMean: sumOf((side) => side.season),
		seasonGames: Math.min(...sides.map((side) => side.season?.games ?? 0)),
		priorMean: sumOf((side) => side.prior),
		priorGames: Math.min(...sides.map((side) => side.prior?.games ?? 0)),
		priorWeight: model.priorWeight,
		blendedMean: roundToThousandths(model.away.blended.mean + model.home.blended.mean),
		expectedMean: roundToThousandths(model.away.expected + model.home.expected),
		opponent: null,
		formula: model.formula,
		scoringFactor: model.scoringFactor,
		pOver: picked.pOver,
		line: picked.line,
	}
}

// How far a postseason's scoring level is assumed to sit from the regular
// season's before any of its games are in: about 15% either way. A
// postseason's first few games are mostly noise, so this is what keeps two
// low-scoring openers from cutting every line, and a few dozen games in, the
// measured level carries most of the weight.
export const POSTSEASON_PRIOR_SD = 0.15

// What each side's scoring is measured as, relative to its own average going
// into each game, in each part of one season. See postseasonFactor.
export type ScoringLevels = {
	regularMean: number
	regularVariance: number
	postseasonMean: number
	postseasonGames: number
}

// What a postseason game's expectations are multiplied by: how its scoring so
// far compares to the regular season's, regressed toward no difference the
// way an opponent's defense is (see opponentAdjustment). The weight is the
// ratio of one team-game's noise to how much postseasons actually differ (see
// POSTSEASON_PRIOR_SD), so a league whose scores swing more game to game
// needs more games before its postseason moves a line much. 1 with nothing
// to measure.
export function postseasonFactor(levels: ScoringLevels | null): number {
	if (!levels || levels.regularMean <= 0 || levels.postseasonGames === 0) {
		return 1
	}
	const raw = levels.postseasonMean / levels.regularMean
	const noise = levels.regularVariance / levels.regularMean ** 2
	const weight = noise / POSTSEASON_PRIOR_SD ** 2
	const trust = levels.postseasonGames / (levels.postseasonGames + weight)
	return roundToThousandths(1 + trust * (raw - 1))
}

// The fewest games a team needs behind one, that season, for its average to
// count as what it was expected to score. Higher than the box spread's own
// floor: a level is a mean of ratios, and a ratio against a two-game average
// pulls that mean up rather than just widening it.
const LEVEL_PRIOR_GAMES = 10

// Each team's final score against its own season average going into the
// game, for one season's regular season and postseason, off the stored box
// scores. Null when the season has no postseason games yet.
export async function scoringLevels(
	leagueId: string,
	seasonId: string,
	asOf: Date,
): Promise<ScoringLevels | null> {
	const { rows } = await db.execute<{
		season_type: Game["seasonType"]
		games: number | string
		mean: number | string | null
		variance: number | string | null
	}>(sql`
		with per_game as (
			select t.team_id, t.game_id, t.game_date, g.season_type,
				sum(t.value_numeric) as value
			from team_game_stats t
			join games g on g.id = t.game_id
			where t.league_id = ${leagueId}
				and t.season_id = ${seasonId}
				and t.scope = 'final_score'
				and t.game_date < ${asOf}
				and t.value_numeric is not null
			group by t.team_id, t.game_id, t.game_date, g.season_type
		), with_prior as (
			select *,
				avg(value) over prior as prior_mean,
				count(*) over prior as prior_games
			from per_game
			window prior as (
				partition by team_id order by game_date
				rows between unbounded preceding and 1 preceding
			)
		)
		select season_type, count(*) as games,
			avg(value / prior_mean) as mean,
			var_samp(value / prior_mean) as variance
		from with_prior
		where prior_games >= ${LEVEL_PRIOR_GAMES} and prior_mean > 0
		group by season_type
	`)
	const regular = rows.find((row) => row.season_type === "regular")
	const postseason = rows.find((row) => row.season_type === "postseason")
	if (!regular || !postseason || regular.mean === null) return null
	if (postseason.mean === null || regular.variance === null) return null
	return {
		regularMean: Number(regular.mean),
		regularVariance: Number(regular.variance),
		postseasonMean: Number(postseason.mean),
		postseasonGames: Number(postseason.games),
	}
}

export type ModelGame = {
	homeTeam: Pick<Team, "id">
	awayTeam: Pick<Team, "id">
	seasonYear: number
	seasonId: string
	seasonType: Game["seasonType"]
}

// The league's team score over/under template, whose settings every team
// expectation is set with and whose resolved lines are the spread.
type TeamTemplate = Extract<
	OverUnderTemplate,
	{ shape: "team_stat_over_under" }
>

// Builds a game's score model for one league over one run. Null for a game
// either team is too early in the season to set an expectation for, or with
// too few past results to read a spread from; callers fall back to however
// they set a line or price without one. One instance per run shares every
// season, standings and ESPN read across all of a league's games.
export function createGameScoreModel(
	leagueSlug: string,
	leagueId: string,
	espn: EspnClient = defaultEspnClient,
): (game: ModelGame) => Promise<GameScoreModel | null> {
	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === leagueSlug)
	const access = { espn, requester: createEspnRequester("game-score-model", 0) }
	const seasonTableFor = createSeasonTableCache(leagueId)
	const teamScoresFor = teamScoresFrom(seasonTableFor)
	const teamSeasonStatsFor = config
		? createTeamSeasonStatsCache(config, access)
		: null
	const standingsFor = config ? createStandingsCache(config, access) : null
	const espnTeamIds = new Map<string, string>()
	const factorBySeason = new Map<string, Promise<number>>()
	const byGame = new Map<string, Promise<GameScoreModel | null>>()
	let setup: Promise<{
		template: TeamTemplate
		spreadByFormula: Map<LineFormula, DuelSpread>
	} | null> | null = null

	const load = async () => {
		const template = withLineSettings(
			GAME_QUESTION_CATALOG[leagueSlug] ?? [],
			await loadLineSettings(leagueSlug),
		)
			.filter(isGeneratedOverUnder)
			.find((t) => t.shape === "team_stat_over_under")
		if (!template || template.shape !== "team_stat_over_under") return null
		const box = await teamScoreBoxSpread({
			leagueId,
			asOf: new Date(),
			regularSeasonOnly: true,
		})
		const spreadByFormula = new Map<LineFormula, DuelSpread>()
		for (const formula of Object.values(LINE_FORMULA)) {
			spreadByFormula.set(
				formula,
				withBoxSpread(
					await duelSpreadFor(leagueSlug, template.id, formula, {
						regularSeasonOnly: true,
					}),
					box,
				),
			)
		}
		return { template, spreadByFormula }
	}

	const factorFor = (game: ModelGame) => {
		if (game.seasonType !== "postseason") return Promise.resolve(1)
		const factor =
			factorBySeason.get(game.seasonId) ??
			scoringLevels(leagueId, game.seasonId, new Date()).then(postseasonFactor)
		factorBySeason.set(game.seasonId, factor)
		return factor
	}

	const build = async (game: ModelGame): Promise<GameScoreModel | null> => {
		if (!config || !teamSeasonStatsFor || !standingsFor) return null
		setup ??= load()
		const loaded = await setup
		if (!loaded) return null
		const { template, spreadByFormula } = loaded
		const enough = (formula: LineFormula) =>
			(spreadByFormula.get(formula)?.ratios.length ?? 0) >= PRICING_MIN_SAMPLE
		const adjusted =
			template.oppWeight !== undefined && enough(LINE_FORMULA.opponentAdjusted)
		if (!adjusted && !enough(LINE_FORMULA.teamOnly)) return null

		const teamIds = [game.awayTeam.id, game.homeTeam.id]
		const missing = teamIds.filter((id) => !espnTeamIds.has(id))
		if (missing.length > 0) {
			for (const [id, espnId] of await loadEspnIds("team", missing)) {
				espnTeamIds.set(id, espnId)
			}
		}

		const sideFor = async (teamId: string, opponentTeamId: string) => {
			const samples = await teamSamples(
				teamScoresFor,
				teamSeasonStatsFor,
				espnTeamIds.get(teamId),
				template,
				teamId,
				game.seasonYear,
			)
			const blended = blendSamples(
				samples.season,
				samples.prior,
				template.priorWeight,
			)
			if (!blended || blended.games < template.line.minGames) return null
			const opponent = adjusted
				? await opponentFor(
						{ seasonTableFor, standingsFor, espnTeamIdByTeamId: espnTeamIds },
						template,
						opponentTeamId,
						game.seasonYear,
					)
				: null
			return { ...samples, blended, opponent }
		}

		const away = await sideFor(game.awayTeam.id, game.homeTeam.id)
		const home = await sideFor(game.homeTeam.id, game.awayTeam.id)
		if (!away || !home) return null
		// Both sides are set under one model, so a defense that couldn't be
		// read on either side drops the adjustment from both.
		const bothAdjusted = !!away.opponent && !!home.opponent
		const formula = bothAdjusted
			? LINE_FORMULA.opponentAdjusted
			: LINE_FORMULA.teamOnly
		const spread = spreadByFormula.get(formula)
		if (!spread || spread.ratios.length < PRICING_MIN_SAMPLE) return null
		const scoringFactor = await factorFor(game)
		const sideOf = (side: typeof away): ModelSide => {
			const opponent = bothAdjusted ? side.opponent : null
			return {
				season: side.season,
				prior: side.prior,
				blended: side.blended,
				opponent,
				expected:
					side.blended.mean * (opponent?.multiplier ?? 1) * scoringFactor,
			}
		}
		return {
			templateId: template.id,
			statName: template.statName,
			away: sideOf(away),
			home: sideOf(home),
			formula,
			priorWeight: template.priorWeight,
			spread,
			edge: isPaired(spread)
				? { home: 1, away: 1 }
				: homeEdge(await seasonTableFor(game.seasonYear)),
			scoringFactor,
		}
	}

	return (game) => {
		const key = [
			game.awayTeam.id,
			game.homeTeam.id,
			game.seasonId,
			game.seasonType,
		].join(":")
		const model = byGame.get(key) ?? build(game)
		byGame.set(key, model)
		return model
	}
}

// Prices who-wins questions for one league over one run, away side first (the
// order their options are in), off each game's score model.
export function createGameWinnerPricer(
	leagueSlug: string,
	leagueId: string,
	espn: EspnClient = defaultEspnClient,
): (game: ModelGame) => Promise<[PricedSide, PricedSide] | null> {
	const modelFor = createGameScoreModel(leagueSlug, leagueId, espn)
	return async (game) => {
		const model = await modelFor(game)
		return model ? priceWinner(model) : null
	}
}

// Prices each side of a team score line a person set on a game, from that
// game's score model: the share of its replayed games the team's score went
// over. The same picture of the game its generated line and who-wins price
// come from, so a person's line is priced against what those already say.
// Null without a model for the game or on another stat, so the caller can
// fall back to pricing the team on its own (see priceUserLine). Never throws,
// and gives up rather than holding the form.
export async function priceUserTeamLine(
	input: {
		leagueId: string
		statName: string
		ouLine: number
		subjectTeamId: string
		game: ModelGame
	},
	espn: EspnClient = defaultEspnClient,
): Promise<PricedLine | null> {
	try {
		const league = await db.query.leagues.findFirst({
			where: { id: input.leagueId },
			columns: { slug: true },
		})
		if (!league) return null
		const model = await withTimeout(
			createGameScoreModel(league.slug, input.leagueId, espn)(input.game),
		)
		if (!model || model.statName !== input.statName) return null
		const side: ScoreSide | null =
			input.subjectTeamId === input.game.homeTeam.id
				? "home"
				: input.subjectTeamId === input.game.awayTeam.id
					? "away"
					: null
		if (!side) return null
		const draws = sideDraws(model, side)
		if (draws.length < LINE_TUNING.minSample) return null
		const pOver = chanceOver(draws, input.ouLine)
		return {
			pricing: {
				templateId: model.templateId,
				blendedMean: roundToThousandths(model[side].expected),
				ratioCount: draws.length,
				pOver: roundToThousandths(pOver),
			},
			...sidePrices(pOver),
			openRange: openLineRangeOf(draws),
		}
	} catch (err) {
		console.error("[game-score-model] pricing a team line failed:", err)
		return null
	}
}
