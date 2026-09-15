import { describe, expect, it } from "vitest"
import {
	makeOption,
	makePlayer,
	makeQuestion,
	makeUser,
} from "../../test/factories"
import { LEADER_TUNING, leaderTemplates } from "./leader-calibration"
import { leaderLossSettingRow, saveLeaderLossSetting } from "./leader-settings"
import { tuneLeaderLosses } from "./tune-leader-losses"

const NOW = new Date("2026-09-14T11:10:00Z")

// `count` resolved NBA points leader questions, the favorite leading one in
// four: a pick on the favorite breaks even at a loss rate of 0.33. They're
// the only leader results anywhere, so every other league stat starts from
// that record too.
async function resolvedLeaders(count: number) {
	const favorite = await makePlayer({ name: "Favorite" })
	const other = await makePlayer({ name: "Other" })
	for (let i = 0; i < count; i++) {
		const favoriteLed = i % 4 === 0
		const question = await makeQuestion({
			shape: "player_game_stat_leader",
			status: "resolved",
			generationKey: `nba:game-${crypto.randomUUID()}:points-leader`,
			leaderBasis: {
				favoritePlayerId: favorite.id,
				favoriteMean: 27,
				contenders: 10,
			},
		})
		await makeOption(question.id, {
			playerId: favorite.id,
			isCorrect: favoriteLed,
		})
		await makeOption(question.id, {
			playerId: other.id,
			isCorrect: !favoriteLed,
		})
	}
}

describe("tuneLeaderLosses", () => {
	it("moves an automatic rate toward where the favorite breaks even", async () => {
		await resolvedLeaders(40)

		expect(await tuneLeaderLosses(NOW)).toBe(leaderTemplates().length)

		const row = await leaderLossSettingRow("nba", "Points")
		expect(row).toMatchObject({
			isCustom: true,
			autoTune: true,
			lossRate: 0.33,
			calibration: {
				resolved: 40,
				favoriteHitRate: 0.25,
				blendedHitRate: 0.25,
				suggestedLossRate: 0.33,
			},
		})
		expect(row?.tunedAt?.getTime()).toBe(NOW.getTime())
	})

	it("starts a league stat with no record of its own from everyone else's", async () => {
		await resolvedLeaders(40)

		await tuneLeaderLosses(NOW)

		expect(await leaderLossSettingRow("nfl", "Sacks")).toMatchObject({
			lossRate: 0.33,
			calibration: {
				resolved: 0,
				favoriteHitRate: null,
				blendedHitRate: 0.25,
			},
		})
	})

	it("leaves a manual rate alone", async () => {
		await resolvedLeaders(40)
		const admin = await makeUser({ isAdmin: true })
		await saveLeaderLossSetting(
			{ leagueSlug: "nba", statName: "Points", lossRate: 0.6, autoTune: false },
			admin.id,
		)

		expect(await tuneLeaderLosses(NOW)).toBe(leaderTemplates().length - 1)

		expect(await leaderLossSettingRow("nba", "Points")).toMatchObject({
			autoTune: false,
			tunedAt: null,
			lossRate: 0.6,
		})
	})

	it("doesn't move a rate without enough resolved questions anywhere", async () => {
		await resolvedLeaders(LEADER_TUNING.minSample - 1)

		expect(await tuneLeaderLosses(NOW)).toBe(0)
		expect((await leaderLossSettingRow("nba", "Points"))?.isCustom).toBe(false)
	})
})
