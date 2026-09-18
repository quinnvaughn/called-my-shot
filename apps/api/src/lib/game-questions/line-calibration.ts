import { db } from "../../db"
import { parseGenerationKey } from "./generation-key"
import { GENERATED_OVER_UNDER_SHAPES } from "./lines"

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
