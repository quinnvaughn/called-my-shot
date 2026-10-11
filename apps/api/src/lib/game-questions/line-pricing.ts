import {
	isWithinUserLineBounds,
	overProbability,
	type SidePrice,
	sidePrices,
} from "@called-my-shot/scoring"
import { db } from "../../db"
import { GAME_QUESTION_CATALOG } from "../../db/catalog/game-question-catalog"
import { defaultEspnClient, type EspnClient } from "../../db/sync/espn-client"
import { createEspnRequester } from "../../db/sync/espn-requester"
import { SYNCED_LEAGUES } from "../../db/sync/leagues"
import { loadEspnIds } from "../../db/sync/sync-refs"
import { LINE_TUNING, ratiosForTemplate } from "./line-calibration"
import {
	isGeneratedOverUnder,
	loadLineSettings,
	withLineSettings,
} from "./line-settings"
import { blendSamples, formulaOf, type OpponentAdjustment } from "./lines"
import {
	createSeasonStatsCache,
	playerSamples,
	type Samples,
} from "./player-samples"
import {
	createSeasonTableCache,
	createStandingsCache,
	createTeamSeasonStatsCache,
	opponentFor,
	teamSamples,
	teamScoresFrom,
} from "./team-lines"

// Prices each side of an over/under line a person set, from the same inputs a
// generated line on that stat is set from: the subject's blended per-game
// average, and how the template's past lines landed against their own
// average. A line near the model's own prices both sides at a full loss; see
// sidePrice for how far off it has to be before that changes.

// What a priced line's sides were set from, stored on questions.linePricing.
export type LinePricing = {
	templateId: string
	blendedMean: number
	ratioCount: number
	pOver: number
}

export type PricedLine = {
	pricing: LinePricing
	over: SidePrice
	under: SidePrice
	// The lowest and highest lines, on the half, that keep both sides within
	// USER_LINE_CHANCE_BOUNDS. Null when no line does.
	openRange: { min: number; max: number } | null
}

type PriceInput = {
	leagueId: string
	shape: "player_stat_over_under" | "team_stat_over_under"
	statName: string
	ouLine: number
	subjectPlayerId?: string | null
	subjectTeamId?: string | null
	// The other side of the game, so a team line is priced against the same
	// opponent-adjusted model a generated one is set from. Without it the
	// pricing would answer a different question than the line does.
	opponentTeamId?: string | null
	seasonYear: number
}

// Creating a question waits on this, so a slow ESPN read gives up rather than
// holding the form.
const ESPN_TIMEOUT_MS = 4000

// Null when the line can't be priced: no template asks this stat, too few of
// its lines have resolved, or the subject's average couldn't be read. Never
// throws, so pricing can't stop a question from being created.
export async function priceUserLine(
	input: PriceInput,
	espn: EspnClient = defaultEspnClient,
): Promise<PricedLine | null> {
	try {
		return await price(input, espn)
	} catch (err) {
		console.error("[line-pricing] failed:", err)
		return null
	}
}

async function price(
	input: PriceInput,
	espn: EspnClient,
): Promise<PricedLine | null> {
	const league = await db.query.leagues.findFirst({
		where: { id: input.leagueId },
		columns: { slug: true },
	})
	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league?.slug)
	if (!league || !config) return null

	const template = withLineSettings(
		GAME_QUESTION_CATALOG[league.slug] ?? [],
		await loadLineSettings(league.slug),
	)
		.filter(isGeneratedOverUnder)
		.find((t) => t.shape === input.shape && t.statName === input.statName)
	if (!template) return null

	const loaded = await withTimeout(
		template.shape === "player_stat_over_under"
			? loadPlayerSamples(
					input.subjectPlayerId,
					template.pick,
					config,
					espn,
					input.seasonYear,
				).then((samples) => (samples ? { samples, opponent: null } : null))
			: loadTeamSamples(input, template, config, espn),
	)
	if (!loaded) return null
	const { samples, opponent } = loaded

	// Read back the pool for the model this price is about to use, which for a
	// team line depends on whether an opponent figure was actually available.
	const ratios = await ratiosForTemplate(
		league.slug,
		template.id,
		formulaOf(opponent),
	)
	if (ratios.length < LINE_TUNING.minSample) return null
	const priorWeight =
		template.shape === "player_stat_over_under"
			? template.pick.priorWeight
			: template.priorWeight
	const blended = blendSamples(samples.season, samples.prior, priorWeight)
	if (!blended || blended.games < template.line.minGames) return null
	const expected = blended.mean * (opponent?.multiplier ?? 1)
	if (expected <= 0) return null

	const pOver = overProbability(ratios, expected, input.ouLine)
	return {
		pricing: {
			templateId: template.id,
			blendedMean: Math.round(expected * 1000) / 1000,
			ratioCount: ratios.length,
			pOver: Math.round(pOver * 1000) / 1000,
		},
		...sidePrices(pOver),
		openRange: openLineRange(ratios, expected),
	}
}

// Every half line between the lowest and highest results the ratios have
// seen, kept where the over's chance stays within USER_LINE_CHANCE_BOUNDS.
// The over's chance only falls as the line rises, so the kept lines are one
// unbroken run.
export function openLineRange(
	ratios: number[],
	mean: number,
): { min: number; max: number } | null {
	const lowest = Math.floor(mean * Math.min(...ratios))
	const highest = Math.ceil(mean * Math.max(...ratios))
	const open: number[] = []
	for (let whole = lowest; whole <= highest; whole++) {
		const line = whole + 0.5
		if (isWithinUserLineBounds(overProbability(ratios, mean, line))) {
			open.push(line)
		}
	}
	const [min] = open
	const max = open.at(-1)
	return min === undefined || max === undefined ? null : { min, max }
}

export async function loadPlayerSamples(
	playerId: string | null | undefined,
	pick: Parameters<typeof playerSamples>[2],
	config: (typeof SYNCED_LEAGUES)[number],
	espn: EspnClient,
	seasonYear: number,
): Promise<Samples | null> {
	if (!playerId) return null
	const espnIds = await loadEspnIds("player", [playerId])
	const seasonStatsFor = createSeasonStatsCache(config, {
		espn,
		requester: createEspnRequester("line-pricing", 0),
	})
	return playerSamples(seasonStatsFor, espnIds.get(playerId), pick, seasonYear)
}

async function loadTeamSamples(
	input: PriceInput,
	template: { priorWeight: number; priorStat: string; oppWeight?: number },
	config: (typeof SYNCED_LEAGUES)[number],
	espn: EspnClient,
): Promise<{ samples: Samples; opponent: OpponentAdjustment | null } | null> {
	if (!input.subjectTeamId) return null
	const teamIds = [input.subjectTeamId, input.opponentTeamId].filter(
		(id): id is string => !!id,
	)
	const espnTeamIdByTeamId = await loadEspnIds("team", teamIds)
	const access = {
		espn,
		requester: createEspnRequester("line-pricing", 0),
	}
	const seasonTableFor = createSeasonTableCache(input.leagueId)
	const samples = await teamSamples(
		teamScoresFrom(seasonTableFor),
		createTeamSeasonStatsCache(config, access),
		espnTeamIdByTeamId.get(input.subjectTeamId),
		template,
		input.subjectTeamId,
		input.seasonYear,
	)
	const opponent = input.opponentTeamId
		? await opponentFor(
				{
					seasonTableFor,
					standingsFor: createStandingsCache(config, access),
					espnTeamIdByTeamId,
				},
				template,
				input.opponentTeamId,
				input.seasonYear,
			)
		: null
	return { samples, opponent }
}

export async function withTimeout<T>(work: Promise<T>): Promise<T | null> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), ESPN_TIMEOUT_MS)
	})
	try {
		return await Promise.race([work, timeout])
	} finally {
		clearTimeout(timer)
	}
}
