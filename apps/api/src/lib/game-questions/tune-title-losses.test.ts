import { describe, expect, it } from "vitest"
import {
	makeGame,
	makeLeague,
	makeOption,
	makeQuestion,
	makeSeason,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { TITLE_TUNING, titleGroups } from "./title-calibration"
import { titleLossSettings } from "./title-settings"
import { tuneTitleLosses } from "./tune-title-losses"

const NOW = new Date("2026-09-14T11:15:00Z")

// `count` resolved NBA Finals questions on a season where the Celtics had the
// best record, the Celtics winning one in four: a pick on the best record
// breaks even at a loss rate of 0.33. They're the only titles anywhere, so
// every other league title starts from that record too.
async function resolvedTitles(count: number) {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({ leagueId: league.id })
	const best = await makeTeam({ leagueId: league.id, name: "Celtics" })
	const other = await makeTeam({ leagueId: league.id, name: "Knicks" })
	for (let i = 0; i < 3; i++) {
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			homeTeamId: best.id,
			awayTeamId: other.id,
			status: "final",
			homeScore: 110,
			awayScore: 100,
		})
	}
	for (let i = 0; i < count; i++) {
		const bestWon = i % 4 === 0
		const question = await makeQuestion({
			shape: "team_season_award",
			status: "resolved",
			leagueId: league.id,
			seasonId: season.id,
			awardName: "NBA Finals",
			awardVerb: "win",
			picksRequired: 1,
		})
		await makeOption(question.id, { teamId: best.id, isCorrect: bestWon })
		await makeOption(question.id, { teamId: other.id, isCorrect: !bestWon })
	}
}

describe("tuneTitleLosses", () => {
	it("moves an automatic rate toward where the best record is priced", async () => {
		await resolvedTitles(TITLE_TUNING.minSample)

		expect(await tuneTitleLosses(NOW)).toBe(titleGroups().length)

		const row = await titleLossSettings.row("nba", "NBA Finals")
		expect(row).toMatchObject({
			isCustom: true,
			autoTune: true,
			lossRate: 0.27,
			calibration: {
				resolved: TITLE_TUNING.minSample,
				ownHitRate: 0.25,
				blendedHitRate: 0.25,
				suggestedLossRate: 0.27,
			},
		})
		expect(row?.tunedAt?.getTime()).toBe(NOW.getTime())
	})

	it("starts a league title with no record of its own from everyone else's", async () => {
		await resolvedTitles(TITLE_TUNING.minSample)

		await tuneTitleLosses(NOW)

		expect(await titleLossSettings.row("nfl", "Super Bowl")).toMatchObject({
			lossRate: 0.27,
			calibration: {
				resolved: 0,
				ownHitRate: null,
				blendedHitRate: 0.25,
			},
		})
	})

	it("leaves a manual rate alone", async () => {
		await resolvedTitles(TITLE_TUNING.minSample)
		const admin = await makeUser({ isAdmin: true })
		await titleLossSettings.save(
			{
				leagueSlug: "nba",
				awardName: "NBA Finals",
				lossRate: 0.6,
				autoTune: false,
			},
			admin.id,
		)

		expect(await tuneTitleLosses(NOW)).toBe(titleGroups().length - 1)

		expect(await titleLossSettings.row("nba", "NBA Finals")).toMatchObject({
			autoTune: false,
			tunedAt: null,
			lossRate: 0.6,
		})
	})

	it("doesn't move a rate without enough resolved titles anywhere", async () => {
		await resolvedTitles(TITLE_TUNING.minSample - 1)

		expect(await tuneTitleLosses(NOW)).toBe(0)
		expect((await titleLossSettings.row("nba", "NBA Finals"))?.isCustom).toBe(
			false,
		)
	})
})
