import { db } from "../../db"
import { parseGenerationKey } from "./generation-key"
import { GENERATED_OVER_UNDER_SHAPES } from "./lines"
import { pushWithin } from "./pooling"

// Lines are meant to be coin flips, so a template whose overs land outside
// this share needs its shade moved: up when overs hit too often (the lines are
// too low), down when unders do.
export const TARGET_OVER_RATE = { low: 0.45, high: 0.55 }

export type CalibrationRow = {
	league: string
	template: string
	// The shade these lines were set with. A template whose shade has changed
	// has a row for each.
	shade: number
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
			shade: number
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
		const id = `${parsed.leagueSlug}:${parsed.templateId}:${basis.shade}`
		const group = groups.get(id) ?? {
			league: parsed.leagueSlug,
			template: parsed.templateId,
			shade: basis.shade,
			overs: 0,
			lines: [],
			means: [],
		}
		if (question.options.some((o) => o.label === "Over" && o.isCorrect)) {
			group.overs++
		}
		group.lines.push(basis.line)
		group.means.push(basis.blendedMean)
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
				a.shade - b.shade,
		)
}

// A generated line is floor(average x shade) + 0.5, so for a whole-number stat
// the over hits exactly when the result divided by the player's average beats
// the shade. The shade that makes the over a coin flip is the median of those
// ratios. A ratio doesn't depend on the shade its line was set with, so every
// resolved line counts toward it, including ones from before a shade change.
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

// Each over/under template's result-to-average ratios, most recent first, by
// "<league>:<template>". Only lines auto-resolution settled carry the result.
export function ratiosByTemplate(): Promise<Map<string, number[]>> {
	return collectRatios()
}

// One template's ratios, most recent first - what a person-set line on the
// same stat is priced from (see line-pricing.ts).
export async function ratiosForTemplate(
	leagueSlug: string,
	templateId: string,
): Promise<number[]> {
	const ratios = await collectRatios(`${leagueSlug}:%:${templateId}:%`)
	return ratios.get(`${leagueSlug}:${templateId}`) ?? []
}

async function collectRatios(
	generationKeyLike?: string,
): Promise<Map<string, number[]>> {
	const resolved = await db.query.questions.findMany({
		where: {
			shape: { in: [...GENERATED_OVER_UNDER_SHAPES] },
			status: "resolved",
			generationKey: generationKeyLike
				? { like: generationKeyLike }
				: { isNotNull: true },
			lineBasis: { isNotNull: true },
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
		const mean = question.lineBasis?.blendedMean
		const value = question.autoResolution?.evidence?.value
		if (!parsed || !mean || mean <= 0 || typeof value !== "number") continue
		pushWithin(
			ratios,
			`${parsed.leagueSlug}:${parsed.templateId}`,
			value / mean,
			LINE_TUNING.window,
		)
	}
	return ratios
}
