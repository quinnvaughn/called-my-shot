import { describe, expect, it } from "vitest"
import { makeGame, makeLeague } from "../test/factories"
import { DAY_MS, HOUR_MS, MINUTE_MS } from "./time"
import {
	type CalendarGame,
	dueStarterGames,
	FINAL_TAIL_MS,
	inGameWindow,
	isAutoResolveDue,
	loadWorkCalendar,
	type WorkCalendar,
} from "./work-calendar"

const NOW = new Date("2026-10-07T18:00:00Z")
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs)

const game = (overrides: Partial<CalendarGame> = {}): CalendarGame => ({
	id: "game-1",
	status: "scheduled",
	startsAt: at(2 * HOUR_MS),
	startersSyncedAt: null,
	finalizedAt: null,
	leagueSlug: "nba",
	...overrides,
})

const calendar = (
	games: CalendarGame[],
	nextAutoResolveAt: Date | null = null,
): WorkCalendar => ({ games, nextAutoResolveAt })

describe("inGameWindow", () => {
	it("is closed with no games", () => {
		expect(inGameWindow(calendar([]), NOW)).toBe(false)
	})

	it("opens 65 minutes before a game starts, in time for its reminders", () => {
		const cal = calendar([game({ startsAt: at(65 * MINUTE_MS) })])
		expect(inGameWindow(cal, NOW)).toBe(true)
		expect(inGameWindow(cal, at(-MINUTE_MS))).toBe(false)
	})

	it("stays open while a game may still be in progress", () => {
		const cal = calendar([game({ status: "live", startsAt: at(-6 * HOUR_MS) })])
		expect(inGameWindow(cal, NOW)).toBe(true)
	})

	it("closes on a game that never went final once it's past the lookback", () => {
		const cal = calendar([
			game({ status: "live", startsAt: at(-6 * HOUR_MS - MINUTE_MS) }),
		])
		expect(inGameWindow(cal, NOW)).toBe(false)
	})

	it("stays open for a while after the last game goes final", () => {
		const cal = calendar([
			game({
				status: "final",
				startsAt: at(-3 * HOUR_MS),
				finalizedAt: at(-FINAL_TAIL_MS),
			}),
		])
		expect(inGameWindow(cal, NOW)).toBe(true)
		expect(inGameWindow(cal, at(MINUTE_MS))).toBe(false)
	})
})

describe("dueStarterGames", () => {
	it("is due for a game inside its league's horizon never refreshed", () => {
		const cal = calendar([game({ startsAt: at(DAY_MS) })])
		expect(dueStarterGames(cal, new Map(), NOW)).toHaveLength(1)
	})

	it("ignores a game past its league's horizon", () => {
		const cal = calendar([game({ startsAt: at(3 * DAY_MS) })])
		expect(dueStarterGames(cal, new Map(), NOW)).toHaveLength(0)
	})

	it("ignores a game that has started", () => {
		const cal = calendar([game({ status: "live", startsAt: at(-HOUR_MS) })])
		expect(dueStarterGames(cal, new Map(), NOW)).toHaveLength(0)
	})

	it("waits out a refresh that came back incomplete", () => {
		const cal = calendar([game({ startsAt: at(2 * DAY_MS) })])
		const tried = new Map([["game-1", at(-HOUR_MS)]])
		expect(dueStarterGames(cal, tried, NOW)).toHaveLength(0)
		expect(dueStarterGames(cal, tried, at(DAY_MS))).toHaveLength(1)
	})
})

describe("isAutoResolveDue", () => {
	it("is due once the earliest attempt comes around", () => {
		expect(isAutoResolveDue(calendar([], at(MINUTE_MS)), NOW)).toBe(false)
		expect(isAutoResolveDue(calendar([], NOW), NOW)).toBe(true)
	})

	it("is never due with nothing waiting", () => {
		expect(isAutoResolveDue(calendar([]), NOW)).toBe(false)
	})
})

describe("loadWorkCalendar", () => {
	it("reads the games inside the lookback and the starters lookahead", async () => {
		const league = await makeLeague({ slug: "nba" })
		const upcoming = await makeGame({
			leagueId: league.id,
			startsAt: at(HOUR_MS),
		})
		await makeGame({ leagueId: league.id, startsAt: at(-DAY_MS) })
		await makeGame({ leagueId: league.id, startsAt: at(30 * DAY_MS) })

		const loaded = await loadWorkCalendar(NOW)

		expect(loaded.games.map((g) => g.id)).toEqual([upcoming.id])
		expect(loaded.games[0]?.leagueSlug).toBe("nba")
		expect(loaded.nextAutoResolveAt).toBeNull()
	})
})
