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
import { defaultEspnClient, type EspnClient } from "../../db/sync/espn-client"
import { SYNCED_LEAGUES } from "../../db/sync/leagues"
import { playerBoxSpread } from "./box-spread"
import {
	LINE_TUNING,
	type PoolOptions,
	pairedRatiosForTemplate,
	type RatioPair,
	ratiosForTemplate,
} from "./line-calibration"
import { loadPlayerSamples, withTimeout } from "./line-pricing"
import {
	loadLineSettings,
	type OverUnderTemplate,
	withLineSettings,
} from "./line-settings"
import { blendSamples, LINE_FORMULA, type LineFormula } from "./lines"

// Prices each side of a head-to-head from the same model an over/under on the
// stat it compares is set from: each side's expected figure, and how the stat
// swings around an expectation from game to game. With enough past games that
// carry both sides' results, each of those games is replayed at this
// matchup's two expectations, and the share a side wins is its chance (see
// pairedDuelProbability) - whatever moved both sides of one game at once, its
// pace or the home side's edge, stays in. Short of that, two sides are drawn
// from the stat's spread separately (see duelProbability).
//
// The spread is the over/under's own resolved lines once there are enough of
// them, since those are measured against the exact expectation a line is set
// from. Until then it's the stored box scores (see box-spread.ts), which carry
// far more games from the first weeks of a season on.

// The fewest past results a spread is priced from. A head-to-head between a
// 120-yard receiver and a 53-yard one doesn't need a deep history to call
// lopsided: this only keeps a price off a spread so thin that one odd game
// would swing it.
export const PRICING_MIN_SAMPLE = 10

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

// What a head-to-head on one template is priced from: past results' ratios one
// at a time, and the same-game pairs among them.
export type DuelSpread = { ratios: number[]; pairs: RatioPair[] }

// The resolved lines' ratios and pairs, each once there are as many as a line
// is tuned from, else the box scores', else whatever the lines have.
export function withBoxSpread(
	lines: DuelSpread,
	box: DuelSpread,
): DuelSpread {
	const pick = <T>(fromLines: T[], fromBox: T[]): T[] =>
		fromLines.length >= LINE_TUNING.minSample ||
		fromBox.length < PRICING_MIN_SAMPLE
			? fromLines
			: fromBox
	return {
		ratios: pick(lines.ratios, box.ratios),
		pairs: pick(lines.pairs, box.pairs),
	}
}

export async function duelSpreadFor(
	leagueSlug: string,
	templateId: string,
	formula: LineFormula,
	options: PoolOptions = {},
): Promise<DuelSpread> {
	const [ratios, pairs] = await Promise.all([
		ratiosForTemplate(leagueSlug, templateId, formula, options),
		pairedRatiosForTemplate(leagueSlug, templateId, formula, options),
	])
	return { ratios, pairs }
}

// Whether there are enough same-game pairs to price from them.
export const isPaired = (spread: DuelSpread) =>
	spread.pairs.length >= PRICING_MIN_SAMPLE

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
	} else if (spread.ratios.length >= PRICING_MIN_SAMPLE) {
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
	const spread = withBoxSpread(
		await duelSpreadFor(league.slug, template.id, LINE_FORMULA.teamOnly),
		await playerBoxSpread({
			leagueId: input.leagueId,
			leagueSlug: league.slug,
			statName: input.statName,
			asOf: new Date(),
		}),
	)
	if (spread.ratios.length < PRICING_MIN_SAMPLE) return null

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
