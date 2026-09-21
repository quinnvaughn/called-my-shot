import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { questionAutoResolutions } from "../../db/schema"
import { makeQuestion, makeUser } from "../../test/factories"
import { LINE_TUNING, median, nextShade } from "./line-calibration"
import { lineSettings } from "./line-settings"
import { tuneLines } from "./tune-lines"

const LEAGUE = "nba"
const TEMPLATE = "top-scorer-points"
const NOW = new Date("2026-09-14T11:00:00Z")

const ratios = (count: number, ratio: number) =>
	Array.from({ length: count }, () => ratio)

function pointsLine() {
	const template = lineSettings.template(LEAGUE, TEMPLATE)
	if (!template) throw new Error(`no ${LEAGUE} over/under ${TEMPLATE}`)
	return template
}

// `count` resolved lines on the template, each set from a 20-a-game average
// and settled on 20 x `ratio`.
async function resolvedLines(count: number, ratio: number) {
	for (let i = 0; i < count; i++) {
		const question = await makeQuestion({
			shape: "player_stat_over_under",
			status: "resolved",
			ouLine: 19.5,
			generationKey: `${LEAGUE}:game-${crypto.randomUUID()}:${TEMPLATE}:team:player`,
			lineBasis: {
				seasonMean: 20,
				seasonGames: 20,
				priorMean: null,
				priorGames: 0,
				priorWeight: 12,
				blendedMean: 20,
				shade: 0.97,
				line: 19.5,
			},
		})
		await db
			.insert(questionAutoResolutions)
			.values({ questionId: question.id, evidence: { value: 20 * ratio } })
	}
}

describe("median", () => {
	it("takes the middle value, or the mean of the middle two", () => {
		expect(median([3, 1, 2])).toBe(2)
		expect(median([4, 1, 3, 2])).toBe(2.5)
		expect(median([])).toBeNull()
	})
})

describe("nextShade", () => {
	it("waits for enough resolved lines", () => {
		expect(nextShade(0.97, ratios(LINE_TUNING.minSample - 1, 0.8))).toBeNull()
	})

	it("moves toward the median ratio by at most a step per run", () => {
		expect(nextShade(0.97, ratios(LINE_TUNING.minSample, 0.8))).toBe(0.92)
		expect(nextShade(0.97, ratios(LINE_TUNING.minSample, 0.95))).toBe(0.95)
	})

	it("stays within the shade bounds", () => {
		expect(nextShade(0.52, ratios(LINE_TUNING.minSample, 0.1))).toBe(0.5)
		expect(nextShade(1.48, ratios(LINE_TUNING.minSample, 3))).toBe(1.5)
	})

	it("leaves a shade already where the ratios point", () => {
		expect(nextShade(0.95, ratios(LINE_TUNING.minSample, 0.95))).toBeNull()
	})
})

describe("tuneLines", () => {
	it("moves an automatic template's shade toward its results and keeps the rest", async () => {
		await resolvedLines(LINE_TUNING.minSample, 0.8)

		expect(await tuneLines(NOW)).toBe(1)

		const row = await lineSettings.row(LEAGUE, TEMPLATE)
		expect(row).toMatchObject({
			autoTune: true,
			line: {
				shade: 0.92,
				minLine: pointsLine().line.minLine,
				minGames: pointsLine().line.minGames,
			},
		})
		expect(row?.tunedAt?.getTime()).toBe(NOW.getTime())
	})

	it("keeps an admin's lowest line while it tunes the shade", async () => {
		const admin = await makeUser({ isAdmin: true })
		await lineSettings.save(
			{
				templateId: TEMPLATE,
				...pointsLine().line,
				leagueSlug: LEAGUE,
				autoTune: true,
				minLine: 20.5,
			},
			admin.id,
		)
		await resolvedLines(LINE_TUNING.minSample, 0.8)

		await tuneLines(NOW)

		expect((await lineSettings.row(LEAGUE, TEMPLATE))?.line).toMatchObject({
			shade: 0.92,
			minLine: 20.5,
		})
	})

	it("leaves a manual template alone", async () => {
		const admin = await makeUser({ isAdmin: true })
		await lineSettings.save(
			{
				templateId: TEMPLATE,
				...pointsLine().line,
				leagueSlug: LEAGUE,
				autoTune: false,
				shade: 1.1,
			},
			admin.id,
		)
		await resolvedLines(LINE_TUNING.minSample, 0.8)

		expect(await tuneLines(NOW)).toBe(0)

		expect(await lineSettings.row(LEAGUE, TEMPLATE)).toMatchObject({
			autoTune: false,
			tunedAt: null,
			line: { shade: 1.1 },
		})
	})

	it("doesn't move a template without enough resolved lines", async () => {
		await resolvedLines(LINE_TUNING.minSample - 1, 0.8)

		expect(await tuneLines(NOW)).toBe(0)
		expect((await lineSettings.row(LEAGUE, TEMPLATE))?.isCustom).toBe(false)
	})
})
