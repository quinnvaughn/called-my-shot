import { overProbability, sideLossRates } from "@called-my-shot/scoring"
import { GAME_QUESTION_CATALOG } from "../../db/catalog/game-question-catalog"
import { db } from "../../db"
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
import { blendSamples } from "./lines"
import {
	createSeasonStatsCache,
	playerSamples,
	type Samples,
} from "./player-samples"
import { createTeamScoreCache } from "./team-lines"

// Prices each side of an over/under line a person set, from the same inputs a
// generated line on that stat is set from: the subject's blended per-game
// average, and how the template's past lines landed against their own
// average. A line near the model's own prices both sides at a full loss; see
// sideLossRates for how far off it has to be before that changes.

// What a priced line's sides were set from, stored on questions.linePricing.
export type LinePricing = {
	templateId: string
	blendedMean: number
	ratioCount: number
	pOver: number
}

export type PricedLine = {
	pricing: LinePricing
	over: number
	under: number
}

type PriceInput = {
	leagueId: string
	shape: "player_stat_over_under" | "team_stat_over_under"
	statName: string
	ouLine: number
	subjectPlayerId?: string | null
	subjectTeamId?: string | null
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

	const ratios = await ratiosForTemplate(league.slug, template.id)
	if (ratios.length < LINE_TUNING.minSample) return null

	const samples = await withTimeout(
		template.shape === "player_stat_over_under"
			? loadPlayerSamples(input, template.pick, config, espn)
			: loadTeamSamples(input, template.priorWeight),
	)
	if (!samples) return null
	const priorWeight =
		template.shape === "player_stat_over_under"
			? template.pick.priorWeight
			: template.priorWeight
	const blended = blendSamples(samples.season, samples.prior, priorWeight)
	if (!blended || blended.games < template.line.minGames || blended.mean <= 0) {
		return null
	}

	const pOver = overProbability(ratios, blended.mean, input.ouLine)
	return {
		pricing: {
			templateId: template.id,
			blendedMean: Math.round(blended.mean * 1000) / 1000,
			ratioCount: ratios.length,
			pOver: Math.round(pOver * 1000) / 1000,
		},
		...sideLossRates(pOver),
	}
}

async function loadPlayerSamples(
	input: PriceInput,
	pick: Parameters<typeof playerSamples>[2],
	config: (typeof SYNCED_LEAGUES)[number],
	espn: EspnClient,
): Promise<Samples | null> {
	if (!input.subjectPlayerId) return null
	const espnIds = await loadEspnIds("player", [input.subjectPlayerId])
	const seasonStatsFor = createSeasonStatsCache(config, {
		espn,
		requester: createEspnRequester("line-pricing", 0),
	})
	return playerSamples(
		seasonStatsFor,
		espnIds.get(input.subjectPlayerId),
		pick,
		input.seasonYear,
	)
}

async function loadTeamSamples(
	input: PriceInput,
	priorWeight: number,
): Promise<Samples | null> {
	if (!input.subjectTeamId) return null
	return createTeamScoreCache(input.leagueId)(
		input.subjectTeamId,
		input.seasonYear,
		priorWeight,
	)
}

async function withTimeout<T>(work: Promise<T>): Promise<T | null> {
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
