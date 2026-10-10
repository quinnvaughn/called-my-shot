import { describe, expect, it } from "vitest"
import { orderLeaguesByActivity } from "./league-order"

const league = (
	id: string,
	{
		live = 0,
		games = 0,
		nextLockAt = null,
	}: { live?: number; games?: number; nextLockAt?: string | null } = {},
) => ({
	id,
	liveGameCount: live,
	currentWindowGameCount: games,
	nextLockAt,
})

const ids = (leagues: { id: string }[]) => leagues.map((l) => l.id)

describe("orderLeaguesByActivity", () => {
	it("puts the league with the most live games first", () => {
		const ordered = orderLeaguesByActivity([
			league("nfl", { games: 14, nextLockAt: "2026-10-09T17:00:00Z" }),
			league("nba", { live: 1, games: 3 }),
			league("mlb", { live: 2, games: 4 }),
		])
		expect(ids(ordered)).toEqual(["mlb", "nba", "nfl"])
	})

	it("ranks leagues with games in their window above ones between windows", () => {
		const ordered = orderLeaguesByActivity([
			league("nfl", { nextLockAt: "2026-10-09T17:00:00Z" }),
			league("mlb", { games: 2, nextLockAt: "2026-10-10T17:00:00Z" }),
		])
		expect(ids(ordered)).toEqual(["mlb", "nfl"])
	})

	it("orders by soonest lock before game count", () => {
		const ordered = orderLeaguesByActivity([
			league("nfl", { games: 14, nextLockAt: "2026-10-11T17:00:00Z" }),
			league("mlb", { games: 2, nextLockAt: "2026-10-09T20:00:00Z" }),
		])
		expect(ids(ordered)).toEqual(["mlb", "nfl"])
	})

	it("puts leagues with nothing open last", () => {
		const ordered = orderLeaguesByActivity([
			league("nhl", { games: 6 }),
			league("nba", { games: 2, nextLockAt: "2026-10-10T00:00:00Z" }),
		])
		expect(ids(ordered)).toEqual(["nba", "nhl"])
	})

	it("falls back to game count, then the incoming order", () => {
		const ordered = orderLeaguesByActivity([
			league("a"),
			league("b", { games: 2 }),
			league("c"),
			league("d", { games: 5 }),
		])
		expect(ids(ordered)).toEqual(["d", "b", "a", "c"])
	})
})
