import { describe, expect, it } from "vitest"
import { makeOption, makeQuestion, makeUser } from "../../test/factories"
import {
	lineSettingRow,
	loadLineSettings,
	overUnderTemplate,
	resetLineSetting,
	saveLineSetting,
	withLineSettings,
} from "./line-settings"

const LEAGUE = "nba"
const TEMPLATE = "top-scorer-points"

function pointsLine() {
	const template = overUnderTemplate(LEAGUE, TEMPLATE)
	if (!template) throw new Error(`no ${LEAGUE} over/under ${TEMPLATE}`)
	return template
}

const row = () => lineSettingRow(LEAGUE, TEMPLATE)

// A resolved generated over/under whose line was set with `shade`.
async function resolvedLine(shade: number, wentOver: boolean) {
	const question = await makeQuestion({
		shape: "player_stat_over_under",
		status: "resolved",
		ouLine: 24.5,
		generationKey: `${LEAGUE}:game-${crypto.randomUUID()}:${TEMPLATE}:team:player`,
		lineBasis: {
			seasonMean: 25,
			seasonGames: 20,
			priorMean: null,
			priorGames: 0,
			priorWeight: 12,
			blendedMean: 25,
			shade,
			line: 24.5,
		},
	})
	await makeOption(question.id, {
		label: "Over",
		sortOrder: 0,
		isCorrect: wentOver,
	})
	await makeOption(question.id, {
		label: "Under",
		sortOrder: 1,
		isCorrect: !wentOver,
	})
}

describe("line settings", () => {
	it("starts every over/under template on the catalog's settings, tuned automatically", async () => {
		expect(await row()).toMatchObject({
			isCustom: false,
			autoTune: true,
			tunedAt: null,
			line: pointsLine().line,
			defaultLine: pointsLine().line,
			calibration: null,
		})
	})

	it("saves settings the generator sets lines from, until they're reset", async () => {
		const admin = await makeUser({ isAdmin: true })
		const saved = { shade: 0.9, minLine: 12.5, minGames: 5 }

		await saveLineSetting(
			pointsLine(),
			{ leagueSlug: LEAGUE, autoTune: false, ...saved },
			admin.id,
		)

		const settings = await loadLineSettings(LEAGUE)
		expect(settings.get(TEMPLATE)).toEqual(saved)
		expect(withLineSettings([pointsLine()], settings)).toEqual([
			{ ...pointsLine(), line: saved },
		])
		expect(await row()).toMatchObject({
			isCustom: true,
			autoTune: false,
			line: saved,
		})

		await resetLineSetting(LEAGUE, TEMPLATE)
		expect(await row()).toMatchObject({
			isCustom: false,
			autoTune: true,
			line: pointsLine().line,
		})
	})

	it("treats saving the catalog's own settings on automatic as a reset", async () => {
		const admin = await makeUser({ isAdmin: true })
		await saveLineSetting(
			pointsLine(),
			{
				leagueSlug: LEAGUE,
				autoTune: false,
				shade: 0.9,
				minLine: 12.5,
				minGames: 5,
			},
			admin.id,
		)

		await saveLineSetting(
			pointsLine(),
			{ leagueSlug: LEAGUE, autoTune: true, ...pointsLine().line },
			admin.id,
		)

		expect((await row())?.isCustom).toBe(false)
		expect((await loadLineSettings(LEAGUE)).has(TEMPLATE)).toBe(false)
	})

	it("keeps a manual template's row even at the catalog's settings", async () => {
		const admin = await makeUser({ isAdmin: true })

		await saveLineSetting(
			pointsLine(),
			{ leagueSlug: LEAGUE, autoTune: false, ...pointsLine().line },
			admin.id,
		)

		expect(await row()).toMatchObject({ isCustom: true, autoTune: false })
	})

	it("counts only the lines set at the template's current shade", async () => {
		const admin = await makeUser({ isAdmin: true })
		const catalogShade = pointsLine().line.shade
		await resolvedLine(catalogShade, true)
		await resolvedLine(catalogShade, false)
		await resolvedLine(0.9, true)

		expect((await row())?.calibration).toMatchObject({
			resolved: 2,
			overRate: 0.5,
			outsideTarget: false,
		})

		await saveLineSetting(
			pointsLine(),
			{ ...pointsLine().line, leagueSlug: LEAGUE, autoTune: false, shade: 0.9 },
			admin.id,
		)

		expect((await row())?.calibration).toMatchObject({
			resolved: 1,
			overRate: 1,
			outsideTarget: true,
		})
	})
})
