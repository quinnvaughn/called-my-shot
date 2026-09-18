import { eq } from "drizzle-orm"
import { db } from "../../db"
import { GAME_QUESTION_CATALOG } from "../../db/catalog/game-question-catalog"
import { gameQuestionLineSettings } from "../../db/schema"
import { parseGenerationKey } from "./generation-key"
import { isGeneratedOverUnder } from "./line-settings"
import { GENERATED_OVER_UNDER_SHAPES } from "./lines"

// A generated line is floor(average x shade) + 0.5, so for a whole-number stat
// the over hits exactly when the result divided by the player's average beats
// the shade. The shade that makes the over a coin flip is the median of those
// ratios. A ratio doesn't depend on the shade its line was set with, so every
// resolved line counts toward it, including ones from before a shade change.
export const TUNING = {
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
	if (ratios.length < TUNING.minSample) return null
	const target = median(ratios)
	if (target === null) return null
	const bounded = clamp(target, TUNING.minShade, TUNING.maxShade)
	const stepped = clamp(
		bounded,
		current - TUNING.maxStep,
		current + TUNING.maxStep,
	)
	const shade = Math.round(stepped * 100) / 100
	return shade === current ? null : shade
}

// Each over/under template's result-to-average ratios, most recent first, by
// "<league>:<template>". Only lines auto-resolution settled carry the result.
async function ratiosByTemplate(): Promise<Map<string, number[]>> {
	const resolved = await db.query.questions.findMany({
		where: {
			shape: { in: [...GENERATED_OVER_UNDER_SHAPES] },
			status: "resolved",
			generationKey: { isNotNull: true },
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
		const key = `${parsed.leagueSlug}:${parsed.templateId}`
		const list = ratios.get(key) ?? []
		if (list.length < TUNING.window) list.push(value / mean)
		ratios.set(key, list)
	}
	return ratios
}

// Moves the shade of every over/under template left on automatic toward the
// over hitting half the time. Minimum games and the lowest line stay as they
// are. Returns how many templates moved.
export async function tuneLines(now = new Date()): Promise<number> {
	const [saved, ratios] = await Promise.all([
		db.select().from(gameQuestionLineSettings),
		ratiosByTemplate(),
	])
	const savedByKey = new Map(
		saved.map((row) => [`${row.leagueSlug}:${row.templateId}`, row]),
	)

	let tuned = 0
	for (const [leagueSlug, templates] of Object.entries(GAME_QUESTION_CATALOG)) {
		for (const template of templates) {
			if (!isGeneratedOverUnder(template)) continue
			const key = `${leagueSlug}:${template.id}`
			const row = savedByKey.get(key)
			if (row && !row.autoTune) continue
			const current = row?.shade ?? template.line.shade
			const shade = nextShade(current, ratios.get(key) ?? [])
			if (shade === null) continue

			// The conflict update only lands on a row still on automatic, so an
			// admin switching the template to manual mid-run keeps their shade.
			await db
				.insert(gameQuestionLineSettings)
				.values({
					leagueSlug,
					templateId: template.id,
					shade,
					minLine: row?.minLine ?? template.line.minLine,
					minGames: row?.minGames ?? template.line.minGames,
					autoTune: true,
					tunedAt: now,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: [
						gameQuestionLineSettings.leagueSlug,
						gameQuestionLineSettings.templateId,
					],
					set: { shade, tunedAt: now, updatedAt: now },
					setWhere: eq(gameQuestionLineSettings.autoTune, true),
				})
			console.log(`[tune-lines] ${key}: shade ${current} -> ${shade}`)
			tuned++
		}
	}
	console.log(`[tune-lines] done, ${tuned} template(s) tuned`)
	return tuned
}
