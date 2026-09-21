import { describe, expect, it } from "vitest"
import {
	makeGame,
	makeLeague,
	makeSeason,
	makeStat,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { DAY_MS } from "../time"
import { bandSettings } from "./band-settings"
import { tuneBands } from "./tune-bands"

const NOW = new Date()

// An NBA league whose Points stat defaults to +/-6, with `count` final games
// between the same two teams: the home team alternates 110 and 90 and the
// away team always scores 100, so half the scores land exactly on the team's
// own average and the band those scores point to is 1.
async function nbaFinals(count: number) {
	const league = await makeLeague({ slug: "nba" })
	await makeStat(
		{ sportId: league.sportId, name: "Points" },
		{ toleranceMode: "absolute", toleranceValue: 6 },
	)
	const season = await makeSeason({ leagueId: league.id })
	const home = await makeTeam({ leagueId: league.id })
	const away = await makeTeam({ leagueId: league.id })
	for (let i = 0; i < count; i++) {
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			homeTeamId: home.id,
			awayTeamId: away.id,
			startsAt: new Date(NOW.getTime() - (count - i) * DAY_MS),
			status: "final",
			homeScore: i % 2 === 0 ? 110 : 90,
			awayScore: 100,
		})
	}
}

describe("tuneBands", () => {
	it("moves an automatic band toward its scores by one step", async () => {
		await nbaFinals(40)

		expect(await tuneBands(NOW)).toBe(1)

		const row = await bandSettings.row("nba", "Points")
		expect(row).toMatchObject({
			isCustom: true,
			autoTune: true,
			tolerance: { mode: "absolute", amount: 5 },
			defaultTolerance: { mode: "absolute", amount: 6 },
			calibration: { samples: 74, suggestedBand: 1 },
		})
		expect(row?.tunedAt?.getTime()).toBe(NOW.getTime())
	})

	it("leaves a manual band alone", async () => {
		await nbaFinals(40)
		const admin = await makeUser({ isAdmin: true })
		await bandSettings.save(
			{ leagueSlug: "nba", statName: "Points", band: 9, autoTune: false },
			admin.id,
		)

		expect(await tuneBands(NOW)).toBe(0)

		expect(await bandSettings.row("nba", "Points")).toMatchObject({
			autoTune: false,
			tunedAt: null,
			tolerance: { mode: "absolute", amount: 9 },
		})
	})

	it("doesn't move a band without enough scores", async () => {
		await nbaFinals(20)

		expect(await tuneBands(NOW)).toBe(0)
		expect((await bandSettings.row("nba", "Points"))?.isCustom).toBe(false)
	})
})
