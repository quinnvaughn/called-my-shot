import { parseGenerationKey } from "../../lib/game-questions/generation-key"
import { isMainModule } from "../../lib/is-main-module"
import { db } from "../index"

// How each generated over/under template's lines have landed: the share of
// its resolved questions that went over. Lines are meant to be coin flips, so
// a template holding outside 45-55% over a real sample needs its shade moved
// in db/catalog/game-question-catalog.ts - up when overs hit too often (the
// lines are too low), down when unders do.

const TARGET_LOW = 0.45
const TARGET_HIGH = 0.55

export type CalibrationRow = {
	league: string
	template: string
	resolved: number
	overRate: number
	averageLine: number
	averageBlendedMean: number
	outsideTarget: boolean
}

export async function lineCalibration(): Promise<CalibrationRow[]> {
	const resolved = await db.query.questions.findMany({
		where: {
			shape: "player_stat_over_under",
			status: "resolved",
			generationKey: { isNotNull: true },
			lineBasis: { isNotNull: true },
		},
		columns: { generationKey: true, lineBasis: true },
		with: { options: { columns: { label: true, isCorrect: true } } },
	})

	const groups = new Map<
		string,
		{ league: string; template: string; overs: number; lines: number[]; means: number[] }
	>()
	for (const question of resolved) {
		const parsed = question.generationKey
			? parseGenerationKey(question.generationKey)
			: null
		const basis = question.lineBasis
		if (!parsed || !basis) continue
		const id = `${parsed.leagueSlug}:${parsed.templateId}`
		const group = groups.get(id) ?? {
			league: parsed.leagueSlug,
			template: parsed.templateId,
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
				resolved: group.lines.length,
				overRate: Math.round(overRate * 1000) / 1000,
				averageLine: average(group.lines),
				averageBlendedMean: average(group.means),
				outsideTarget: overRate < TARGET_LOW || overRate > TARGET_HIGH,
			}
		})
		.sort(
			(a, b) =>
				a.league.localeCompare(b.league) || a.template.localeCompare(b.template),
		)
}

if (isMainModule(import.meta.url)) {
	lineCalibration()
		.then((rows) => {
			if (rows.length === 0) {
				console.log("No resolved generated over/unders yet.")
			} else {
				console.table(rows)
			}
			process.exit(0)
		})
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}
