import {
	duelProbability,
	pairedDuelProbability,
	type SidePrice,
	sidePrice,
} from "@called-my-shot/scoring"
import { db } from "../../db"
import {
	GAME_QUESTION_CATALOG,
	type GameQuestionTemplate,
} from "../../db/catalog/game-question-catalog"
import type { Team } from "../../db/schema"
import { defaultEspnClient, type EspnClient } from "../../db/sync/espn-client"
import { createEspnRequester } from "../../db/sync/espn-requester"
import { SYNCED_LEAGUES } from "../../db/sync/leagues"
import { loadEspnIds } from "../../db/sync/sync-refs"
import {
	LINE_TUNING,
	pairedRatiosForTemplate,
	type RatioPair,
	ratiosForTemplate,
} from "./line-calibration"
import { loadPlayerSamples, withTimeout } from "./line-pricing"
import {
	isGeneratedOverUnder,
	loadLineSettings,
	type OverUnderTemplate,
	withLineSettings,
} from "./line-settings"
import { blendSamples, LINE_FORMULA, type LineFormula } from "./lines"
import {
	createSeasonTableCache,
	createStandingsCache,
	createTeamSeasonStatsCache,
	homeEdge,
	opponentFor,
	teamSamples,
	teamScoresFrom,
} from "./team-lines"

// Prices each side of a head-to-head from the same model an over/under on the
// stat it compares is set from: each side's expected figure, and how that
// stat's past lines landed against their own expectation. Once enough past
// games had that over/under resolve on both teams, each of those games is
// replayed at this matchup's two expectations, and the share a side wins is
// its chance (see pairedDuelProbability) - whatever moved both sides of one
// game at once, its pace or the home side's edge, stays in. Until then, two
// sides are drawn from the stat's spread separately (see duelProbability).

// One side's price, stored on its option (questionOptions.winMult, lossRate
// and modelHitRate).
export type PricedSide = SidePrice & { modelHitRate: number }

const roundToThousandths = (value: number) => Math.round(value * 1000) / 1000

export function pricedSide(modelHitRate: number): PricedSide {
	return {
		...sidePrice(modelHitRate),
		modelHitRate: roundToThousandths(modelHitRate),
	}
}

// What a head-to-head on one template is priced from: its resolved lines'
// ratios one at a time, and the same-game pairs among them.
export type DuelSpread = { ratios: number[]; pairs: RatioPair[] }

export async function duelSpreadFor(
	leagueSlug: string,
	templateId: string,
	formula: LineFormula,
): Promise<DuelSpread> {
	const [ratios, pairs] = await Promise.all([
		ratiosForTemplate(leagueSlug, templateId, formula),
		pairedRatiosForTemplate(leagueSlug, templateId, formula),
	])
	return { ratios, pairs }
}

// Whether there are enough same-game pairs to price from them.
export const isPaired = (spread: DuelSpread) =>
	spread.pairs.length >= LINE_TUNING.minSample

// Both sides, away first. Null with too few past lines to read a spread from,
// or nothing expected of either side.
export function priceDuel(
	spread: DuelSpread,
	awayMean: number,
	homeMean: number,
): [PricedSide, PricedSide] | null {
	if (Math.max(awayMean, homeMean) <= 0) return null
	let p: number
	if (isPaired(spread)) {
		p = pairedDuelProbability(
			spread.pairs.map(({ away, home }) => [away, home]),
			awayMean,
			homeMean,
		)
	} else if (spread.ratios.length >= LINE_TUNING.minSample) {
		p = duelProbability(spread.ratios, awayMean, homeMean)
	} else {
		return null
	}
	return [pricedSide(p), pricedSide(1 - p)]
}

// The player over/under template on the stat a player head-to-head compares,
// whose resolved lines are the spread that head-to-head is priced from. A
// generated duel names the ESPN figure its players are ranked on too, so it
// reads the over/under measured the same way.
export function playerLineTemplateFor(
	templates: GameQuestionTemplate[],
	statName: string,
	espnStat?: string | readonly string[],
): Extract<OverUnderTemplate, { shape: "player_stat_over_under" }> | null {
	const key = (stat: string | readonly string[]) => [stat].flat().join("+")
	for (const template of templates) {
		if (
			template.shape === "player_stat_over_under" &&
			template.statName === statName &&
			(espnStat === undefined || key(template.pick.espnStat) === key(espnStat))
		) {
			return template
		}
	}
	return null
}

// Never throws and gives up rather than holding the form, same as
// priceUserLine: a duel that can't be priced is created at the question's own
// loss rate.
export async function priceUserDuel(
	input: UserDuelInput,
	espn: EspnClient = defaultEspnClient,
): Promise<[PricedSide, PricedSide] | null> {
	try {
		return await withTimeout(priceUserDuelInner(input, espn))
	} catch (err) {
		console.error("[duel-pricing] failed:", err)
		return null
	}
}

// The two players in the order the question lists them, and the game they
// meet in.
type UserDuelInput = {
	leagueId: string
	statName: string
	playerIds: [string, string]
	game: { homeTeamId: string; awayTeamId: string }
	seasonYear: number
}

async function priceUserDuelInner(
	input: UserDuelInput,
	espn: EspnClient,
): Promise<[PricedSide, PricedSide] | null> {
	const league = await db.query.leagues.findFirst({
		where: { id: input.leagueId },
		columns: { slug: true },
	})
	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league?.slug)
	if (!league || !config) return null

	const template = playerLineTemplateFor(
		withLineSettings(
			GAME_QUESTION_CATALOG[league.slug] ?? [],
			await loadLineSettings(league.slug),
		),
		input.statName,
	)
	if (!template) return null
	const spread = await duelSpreadFor(
		league.slug,
		template.id,
		LINE_FORMULA.teamOnly,
	)
	if (spread.ratios.length < LINE_TUNING.minSample) return null

	// Same-game pairs say which side of the game each result came from, so
	// they only apply to two players on opposite teams of it. Anyone else is
	// priced off the ratios alone.
	const players = await db.query.players.findMany({
		where: { id: { in: input.playerIds } },
		columns: { id: true, currentTeamId: true },
	})
	const teamOf = (id: string) =>
		players.find((player) => player.id === id)?.currentTeamId
	const [firstId, secondId] = input.playerIds
	const firstIsHome =
		teamOf(firstId) === input.game.homeTeamId &&
		teamOf(secondId) === input.game.awayTeamId
	const firstIsAway =
		teamOf(firstId) === input.game.awayTeamId &&
		teamOf(secondId) === input.game.homeTeamId
	const usable = firstIsHome || firstIsAway ? spread : { ...spread, pairs: [] }

	const means: number[] = []
	for (const playerId of input.playerIds) {
		const samples = await loadPlayerSamples(
			playerId,
			template.pick,
			config,
			espn,
			input.seasonYear,
		)
		const blended = samples
			? blendSamples(samples.season, samples.prior, template.pick.priorWeight)
			: null
		if (!blended || blended.games < template.line.minGames) return null
		means.push(blended.mean)
	}
	const [first, second] = means
	if (first === undefined || second === undefined) return null
	if (!firstIsHome) return priceDuel(usable, first, second)
	const sides = priceDuel(usable, second, first)
	return sides ? [sides[1], sides[0]] : null
}

export type GameWinnerGame = {
	homeTeam: Pick<Team, "id">
	awayTeam: Pick<Team, "id">
	seasonYear: number
}

// Prices who-wins questions for one league over one run, away side first (the
// order their options are in). Each team's expected score is set the way its
// own score over/under's line is - its blended scoring, moved by the other
// side's defense where the template asks for it - and priced against how that
// over/under's lines resolved. Same-game pairs already carry the home side's
// edge; priced off the ratios alone, each expectation is moved by the season's
// measured home edge instead (see homeEdge).
// One instance per run shares every season, standings and ESPN read across
// all of a league's games.
export function createGameWinnerPricer(
	leagueSlug: string,
	leagueId: string,
	espn: EspnClient = defaultEspnClient,
): (game: GameWinnerGame) => Promise<[PricedSide, PricedSide] | null> {
	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === leagueSlug)
	const access = { espn, requester: createEspnRequester("duel-pricing", 0) }
	const seasonTableFor = createSeasonTableCache(leagueId)
	const teamScoresFor = teamScoresFrom(seasonTableFor)
	const teamSeasonStatsFor = config
		? createTeamSeasonStatsCache(config, access)
		: null
	const standingsFor = config ? createStandingsCache(config, access) : null
	const espnTeamIds = new Map<string, string>()
	let setup: Promise<{
		template: Extract<OverUnderTemplate, { shape: "team_stat_over_under" }>
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
		const spreadByFormula = new Map<LineFormula, DuelSpread>()
		for (const formula of Object.values(LINE_FORMULA)) {
			spreadByFormula.set(
				formula,
				await duelSpreadFor(leagueSlug, template.id, formula),
			)
		}
		return { template, spreadByFormula }
	}

	return async (game) => {
		if (!config || !teamSeasonStatsFor || !standingsFor) return null
		setup ??= load()
		const loaded = await setup
		if (!loaded) return null
		const { template, spreadByFormula } = loaded
		const enough = (formula: LineFormula) =>
			(spreadByFormula.get(formula)?.ratios.length ?? 0) >=
			LINE_TUNING.minSample
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

		const expectedFor = async (teamId: string, opponentTeamId: string) => {
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
						{
							seasonTableFor,
							standingsFor,
							espnTeamIdByTeamId: espnTeamIds,
						},
						template,
						opponentTeamId,
						game.seasonYear,
					)
				: null
			return { mean: blended.mean, opponent }
		}

		const away = await expectedFor(game.awayTeam.id, game.homeTeam.id)
		const home = await expectedFor(game.homeTeam.id, game.awayTeam.id)
		if (!away || !home) return null
		// Both sides are priced under one model, so a defense that couldn't be
		// read on either side drops the adjustment from both.
		const bothAdjusted = !!away.opponent && !!home.opponent
		const spread = spreadByFormula.get(
			bothAdjusted ? LINE_FORMULA.opponentAdjusted : LINE_FORMULA.teamOnly,
		)
		if (!spread) return null
		const edge = isPaired(spread)
			? { home: 1, away: 1 }
			: homeEdge(await seasonTableFor(game.seasonYear))
		const expected = (side: typeof away, mult: number) =>
			side.mean * (bothAdjusted ? (side.opponent?.multiplier ?? 1) : 1) * mult
		return priceDuel(spread, expected(away, edge.away), expected(home, edge.home))
	}
}
