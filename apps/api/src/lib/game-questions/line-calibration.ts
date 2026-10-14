import { db } from "../../db"
import { parseGenerationKey } from "./generation-key"
import {
	expectedMeanOf,
	formulaOfBasis,
	GENERATED_OVER_UNDER_SHAPES,
	type LineFormula,
} from "./lines"
import { pushWithin } from "./pooling"

// Lines are meant to be coin flips, so a template whose overs land outside
// this share needs its shade moved: up when overs hit too often (the lines are
// too low), down when unders do.
export const TARGET_OVER_RATE = { low: 0.45, high: 0.55 }

export type CalibrationRow = {
	league: string
	template: string
	// The shade these lines were set with. A template whose shade has changed
	// has a row for each. Null for the lines a game's score model set, which
	// have no shade.
	shade: number | null
	// The model these lines were set with. Rows from an older model are kept
	// and shown rather than dropped, so a change stays visible, but they are
	// never averaged in with the current one.
	formula: string
	resolved: number
	overRate: number
	averageLine: number
	averageBlendedMean: number
	outsideTarget: boolean
}

// How each generated over/under template's lines have landed: the share of
// its resolved questions that went over, per shade they were set with.
export async function lineCalibration(): Promise<CalibrationRow[]> {
	const resolved = await db.query.questions.findMany({
		where: {
			shape: { in: [...GENERATED_OVER_UNDER_SHAPES] },
			status: "resolved",
			generationKey: { isNotNull: true },
			lineBasis: { isNotNull: true },
		},
		columns: { generationKey: true, lineBasis: true },
		with: { options: { columns: { label: true, isCorrect: true } } },
	})

	const groups = new Map<
		string,
		{
			league: string
			template: string
			shade: number | null
			formula: string
			overs: number
			lines: number[]
			means: number[]
		}
	>()
	for (const question of resolved) {
		const parsed = question.generationKey
			? parseGenerationKey(question.generationKey)
			: null
		const basis = question.lineBasis
		if (!parsed || !basis) continue
		const formula = formulaOfBasis(basis)
		// Every line the game score model set counts as one group: it has no
		// shade to tell them apart by.
		const shade = basis.shade ?? null
		const id = `${parsed.leagueSlug}:${parsed.templateId}:${shade}:${formula}`
		const group = groups.get(id) ?? {
			league: parsed.leagueSlug,
			template: parsed.templateId,
			shade,
			formula,
			overs: 0,
			lines: [],
			means: [],
		}
		if (question.options.some((o) => o.label === "Over" && o.isCorrect)) {
			group.overs++
		}
		group.lines.push(basis.line)
		group.means.push(expectedMeanOf(basis))
		groups.set(id, group)
	}

	const average = (values: number[]) =>
		Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) /
		100
	return [...groups.values()]
		.map((group) => {
			const overRate = group.overs / group.lines.length
			return {
				league: group.league,
				template: group.template,
				shade: group.shade,
				formula: group.formula,
				resolved: group.lines.length,
				overRate: Math.round(overRate * 1000) / 1000,
				averageLine: average(group.lines),
				averageBlendedMean: average(group.means),
				outsideTarget:
					overRate < TARGET_OVER_RATE.low || overRate > TARGET_OVER_RATE.high,
			}
		})
		.sort(
			(a, b) =>
				a.league.localeCompare(b.league) ||
				a.template.localeCompare(b.template) ||
				(a.shade ?? 0) - (b.shade ?? 0) ||
				a.formula.localeCompare(b.formula),
		)
}

// A generated line is floor(expectation x shade) + 0.5, so for a whole-number
// stat the over hits exactly when the result divided by the expectation beats
// the shade. The shade that makes the over a coin flip is the median of those
// ratios. A ratio doesn't depend on the shade its line was set with, so every
// resolved line counts toward it, including ones from before a shade change.
//
// It does depend on the model behind the expectation, though: a ratio against
// an opponent-adjusted number and one against a bare average are answers to
// different questions, and a median across both would tune a shade against
// neither. So each model keeps its own pool, keyed into the map alongside the
// template, and a caller reads the one it sets lines with - see LINE_FORMULA.
// A template that never gained an adjustment keeps its whole history.
export const LINE_TUNING = {
	// The fewest resolved lines a template is tuned from.
	minSample: 30,
	// The most recent resolved lines the median is taken over, so a shade
	// follows how a stat plays now rather than all-time.
	window: 100,
	// The most a shade moves in one run, so a streak of odd games can't swing
	// every line at once.
	maxStep: 0.05,
	minShade: 0.5,
	maxShade: 1.5,
}

const clamp = (value: number, low: number, high: number) =>
	Math.min(high, Math.max(low, value))

export function median(values: number[]): number | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1
		? (sorted[middle] as number)
		: ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

// The shade to move to from `current`, or null to leave it: too few ratios to
// go on, or already where they point.
export function nextShade(current: number, ratios: number[]): number | null {
	if (ratios.length < LINE_TUNING.minSample) return null
	const target = median(ratios)
	if (target === null) return null
	const bounded = clamp(target, LINE_TUNING.minShade, LINE_TUNING.maxShade)
	const stepped = clamp(
		bounded,
		current - LINE_TUNING.maxStep,
		current + LINE_TUNING.maxStep,
	)
	const shade = Math.round(stepped * 100) / 100
	return shade === current ? null : shade
}

// The key a pool is filed under: the template, then the model that set it.
export const ratioKey = (
	leagueSlug: string,
	templateId: string,
	formula: LineFormula,
) => `${leagueSlug}:${templateId}:${formula}`

// Each over/under template's result-to-expectation ratios, most recent first,
// by ratioKey. Only lines auto-resolution settled carry the result.
export function ratiosByTemplate(): Promise<Map<string, number[]>> {
	return collectRatios()
}

// Narrows a pool to regular-season games, for the game score model: it
// measures a postseason's scoring level on its own (see postseasonFactor), so
// postseason results in its spread would count that level twice.
export type PoolOptions = { regularSeasonOnly?: boolean }

// One template's ratios under one model, most recent first - what a
// person-set line on the same stat is priced from (see line-pricing.ts).
export async function ratiosForTemplate(
	leagueSlug: string,
	templateId: string,
	formula: LineFormula,
	options: PoolOptions = {},
): Promise<number[]> {
	const ratios = await collectRatios(`${leagueSlug}:%:${templateId}:%`, options)
	return ratios.get(ratioKey(leagueSlug, templateId, formula)) ?? []
}

async function collectRatios(
	generationKeyLike?: string,
	options: PoolOptions = {},
): Promise<Map<string, number[]>> {
	const resolved = await db.query.questions.findMany({
		where: {
			shape: { in: [...GENERATED_OVER_UNDER_SHAPES] },
			status: "resolved",
			generationKey: generationKeyLike
				? { like: generationKeyLike }
				: { isNotNull: true },
			lineBasis: { isNotNull: true },
			...(options.regularSeasonOnly && { game: { seasonType: "regular" } }),
		},
		columns: { generationKey: true, lineBasis: true },
		with: { autoResolution: { columns: { evidence: true } } },
		orderBy: { locksAt: "desc" },
	})

	const ratios = new Map<string, number[]>()
	for (const question of resolved) {
		const parsed = question.generationKey
			? parseGenerationKey(question.generationKey)
			: null
		const basis = question.lineBasis
		const mean = basis ? expectedMeanOf(basis) : null
		const value = question.autoResolution?.evidence?.value
		if (!parsed || !basis || !mean || mean <= 0) continue
		if (typeof value !== "number") continue
		pushWithin(
			ratios,
			ratioKey(parsed.leagueSlug, parsed.templateId, formulaOfBasis(basis)),
			value / mean,
			LINE_TUNING.window,
		)
	}
	return ratios
}

// One past game's results on both sides of it, each against its own
// expectation (result / expectation), for the same template under the same
// model. What a head-to-head is priced from once there are enough: a fast
// game, a blowout or the home side's edge moves both results at once, and a
// pair keeps that where two unrelated games' ratios can't.
export type RatioPair = { home: number; away: number }

// One template's same-game pairs under one model, most recent first: every
// game where the template's lines on both teams resolved with a reading. A
// per-team key's first slot after the template is the team it's about, which
// is what says which side of the game a ratio belongs to.
export async function pairedRatiosForTemplate(
	leagueSlug: string,
	templateId: string,
	formula: LineFormula,
	options: PoolOptions = {},
): Promise<RatioPair[]> {
	const resolved = await db.query.questions.findMany({
		where: {
			shape: { in: [...GENERATED_OVER_UNDER_SHAPES] },
			status: "resolved",
			generationKey: { like: `${leagueSlug}:%:${templateId}:%` },
			lineBasis: { isNotNull: true },
			...(options.regularSeasonOnly && { game: { seasonType: "regular" } }),
		},
		columns: { generationKey: true, lineBasis: true },
		with: {
			autoResolution: { columns: { evidence: true } },
			game: { columns: { id: true, homeTeamId: true, awayTeamId: true } },
		},
		orderBy: { locksAt: "desc" },
	})

	const byGame = new Map<string, Partial<RatioPair>>()
	for (const question of resolved) {
		const parsed = question.generationKey
			? parseGenerationKey(question.generationKey)
			: null
		const basis = question.lineBasis
		const mean = basis ? expectedMeanOf(basis) : null
		const value = question.autoResolution?.evidence?.value
		const game = question.game
		if (!parsed || parsed.templateId !== templateId || !basis || !game) continue
		if (formulaOfBasis(basis) !== formula) continue
		if (!mean || mean <= 0 || typeof value !== "number") continue
		const teamId = parsed.rest[0]
		const side =
			teamId === game.homeTeamId
				? "home"
				: teamId === game.awayTeamId
					? "away"
					: null
		if (!side) continue
		const pair = byGame.get(game.id) ?? {}
		pair[side] ??= value / mean
		byGame.set(game.id, pair)
	}

	const pairs: RatioPair[] = []
	for (const { home, away } of byGame.values()) {
		if (home === undefined || away === undefined) continue
		pairs.push({ home, away })
		if (pairs.length === LINE_TUNING.window) break
	}
	return pairs
}
