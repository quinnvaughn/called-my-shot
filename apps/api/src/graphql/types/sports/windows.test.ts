import { describe, expect, it } from "vitest"
import {
	makeGame,
	makeLeague,
	makeSeason,
	makeTeam,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"
import { buildWeekWindowKey, getLeagueWindows, parseWindowKey } from "./windows"

describe("buildWeekWindowKey / parseWindowKey", () => {
	it("round-trips a week key", () => {
		const key = buildWeekWindowKey(2026, "regular", 3)
		expect(key).toBe("2026-reg-w3")
		expect(parseWindowKey(key)).toStrictEqual({
			kind: "week",
			seasonYear: 2026,
			seasonType: "regular",
			weekNumber: 3,
		})
	})

	it("keeps a postseason week distinct from the regular-season week of the same number", () => {
		expect(buildWeekWindowKey(2026, "postseason", 1)).toBe("2026-post-w1")
		expect(buildWeekWindowKey(2026, "regular", 1)).toBe("2026-reg-w1")
	})

	it("reads a date key as a day", () => {
		expect(parseWindowKey("2026-09-20")).toStrictEqual({
			kind: "day",
			day: "2026-09-20",
		})
	})

	it("rejects anything that is not one of the two formats", () => {
		// Including the key format this replaced - a season uuid with colons.
		// It has to come back null rather than parse into a bogus scope.
		expect(
			parseWindowKey("027fc05b-2e57-4450-bdb8-deecab809953:regular:1"),
		).toBeNull()
		expect(parseWindowKey("")).toBeNull()
		expect(parseWindowKey("2026-reg-w")).toBeNull()
		expect(parseWindowKey("nonsense")).toBeNull()
	})
})

describe("getLeagueWindows", () => {
	it("keys a week league's windows readably, with no uuid", async () => {
		const league = await makeLeague({ windowType: "week" })
		const season = await makeSeason({ leagueId: league.id, year: 2026 })
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			seasonType: "regular",
			weekNumber: 3,
		})

		const [window] = await getLeagueWindows(league)
		expect(window?.key).toBe("2026-reg-w3")
		expect(window?.scope).toMatchObject({
			kind: "week",
			seasonId: season.id,
			seasonType: "regular",
			weekNumber: 3,
			seasonYear: 2026,
		})
	})

	it("keys a date league's windows by ET day", async () => {
		const league = await makeLeague({ windowType: "date" })
		const season = await makeSeason({ leagueId: league.id })
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			// Noon UTC is the same calendar day in ET, so this is not a
			// boundary case - it just pins the format.
			startsAt: new Date("2026-09-20T16:00:00Z"),
		})

		const [window] = await getLeagueWindows(league)
		expect(window?.key).toBe("2026-09-20")
		expect(window?.scope).toStrictEqual({ kind: "day", day: "2026-09-20" })
	})
})

const GAME_WINDOW_KEY = /* GraphQL */ `
	query GameWindowKey($id: ID!) {
		game(id: $id) {
			id
			windowKey
		}
	}
`

// The regression this file exists for. Game.windowKey is built independently
// of getLeagueWindows, to point a "back to Games" link at the window holding
// that game. If the two ever spell a key differently, nothing throws: the key
// matches no window, leagueGamesForWindow falls through to
// pickDefaultWindowIndex, and the link quietly lands on today/this week
// instead of the game's own. Only an equality check catches that.
describe("Game.windowKey", () => {
	it("matches the key getLeagueWindows computes, for a week league", async () => {
		const league = await makeLeague({ windowType: "week" })
		const season = await makeSeason({ leagueId: league.id, year: 2026 })
		const home = await makeTeam({ leagueId: league.id })
		const away = await makeTeam({ leagueId: league.id })
		const game = await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			homeTeamId: home.id,
			awayTeamId: away.id,
			seasonType: "postseason",
			weekNumber: 2,
		})

		const windows = await getLeagueWindows(league)
		const data = await expectData(GAME_WINDOW_KEY, {
			variables: { id: game.id },
		})

		const windowKey = (data.game as { windowKey: string }).windowKey
		expect(windowKey).toBe("2026-post-w2")
		expect(windows.map((w) => w.key)).toContain(windowKey)
	})

	it("matches the key getLeagueWindows computes, for a date league", async () => {
		const league = await makeLeague({ windowType: "date" })
		const season = await makeSeason({ leagueId: league.id })
		const game = await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			startsAt: new Date("2026-09-20T16:00:00Z"),
		})

		const windows = await getLeagueWindows(league)
		const data = await expectData(GAME_WINDOW_KEY, {
			variables: { id: game.id },
		})

		const windowKey = (data.game as { windowKey: string }).windowKey
		expect(windowKey).toBe("2026-09-20")
		expect(windows.map((w) => w.key)).toContain(windowKey)
	})
})
