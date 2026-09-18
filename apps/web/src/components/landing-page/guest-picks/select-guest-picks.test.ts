import { describe, expect, it } from "vitest"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	type GuestPickCandidate,
	guestPickLeagues,
	orderGuestPicks,
	refillSlots,
} from "./select-guest-picks"

const NOW = Date.parse("2026-09-13T18:00:00Z")

let n = 0
function question(
	league: string,
	locksInMinutes: number,
	shape: QuestionShape = "YES_NO_PROP",
): GuestPickCandidate {
	n++
	return {
		id: `${league}-${locksInMinutes}-${n}`,
		shape,
		locksAt: new Date(NOW + locksInMinutes * 60_000).toISOString(),
		league: { id: league, abbreviation: league.toUpperCase() },
	}
}

const ids = (questions: GuestPickCandidate[]) => questions.map((q) => q.id)

describe("orderGuestPicks", () => {
	it("drops anything locking within 20 minutes", () => {
		const tooSoon = question("mlb", 19)
		const justEnough = question("mlb", 20)
		const later = question("mlb", 90)

		expect(ids(orderGuestPicks([tooSoon, justEnough, later], NOW))).toEqual(
			ids([justEnough, later]),
		)
	})

	it("lets leagues take turns when no league is selected", () => {
		const mlb30 = question("mlb", 30)
		const mlb40 = question("mlb", 40)
		const mlb50 = question("mlb", 50)
		const nfl60 = question("nfl", 60)

		expect(ids(orderGuestPicks([mlb50, nfl60, mlb40, mlb30], NOW))).toEqual(
			ids([mlb30, nfl60, mlb40, mlb50]),
		)
	})

	it("opens on the selected league and exhausts it before any other", () => {
		const mlb30 = question("mlb", 30)
		const mlb40 = question("mlb", 40)
		const mlb50 = question("mlb", 50)
		const nfl60 = question("nfl", 60)

		expect(
			ids(orderGuestPicks([mlb50, nfl60, mlb40, mlb30], NOW, "nfl")),
		).toEqual(ids([nfl60, mlb30, mlb40, mlb50]))
	})

	it("fills a short slate from other leagues rather than a short stack", () => {
		const nfl60 = question("nfl", 60)
		const mlb30 = question("mlb", 30)
		const nba40 = question("nba", 40)

		expect(ids(orderGuestPicks([mlb30, nba40, nfl60], NOW, "nfl"))).toEqual(
			ids([nfl60, mlb30, nba40]),
		)
	})

	it("opens on three of the selected league when that is all it has", () => {
		// Any league out of season: the only questions up are for opening
		// night, so every one of them is a game-winner. The variety rule must
		// not reach into another league to break them up.
		const nba1 = question("nba", 5000, "TEAM_VS_TEAM")
		const nba2 = question("nba", 5100, "TEAM_VS_TEAM")
		const nba3 = question("nba", 5200, "TEAM_VS_TEAM")
		const mlbOver = question("mlb", 30, "PLAYER_STAT_OVER_UNDER")
		const mlbProp = question("mlb", 40, "YES_NO_PROP")

		const ordered = orderGuestPicks(
			[mlbOver, mlbProp, nba1, nba2, nba3],
			NOW,
			"nba",
		)

		expect(ids(ordered.slice(0, 3))).toEqual(ids([nba1, nba2, nba3]))
	})

	it("only borrows another league once the selected one is spent", () => {
		const nba1 = question("nba", 5000, "TEAM_VS_TEAM")
		const nba2 = question("nba", 5100, "TEAM_VS_TEAM")
		const mlbOver = question("mlb", 30, "PLAYER_STAT_OVER_UNDER")

		expect(ids(orderGuestPicks([mlbOver, nba1, nba2], NOW, "nba"))).toEqual(
			ids([nba1, nba2, mlbOver]),
		)
	})

	it("keeps a second game-winner out of the opening three", () => {
		const nflWinner = question("nfl", 30, "TEAM_VS_TEAM")
		const mlbWinner = question("mlb", 35, "TEAM_VS_TEAM")
		const mlbOver = question("mlb", 40, "PLAYER_STAT_OVER_UNDER")
		const mlbProp = question("mlb", 45, "YES_NO_PROP")

		expect(
			ids(orderGuestPicks([nflWinner, mlbWinner, mlbOver, mlbProp], NOW)),
		).toEqual(ids([nflWinner, mlbOver, mlbProp, mlbWinner]))
	})

	it("defers a second game-winner within the selected league too", () => {
		const first = question("mlb", 30, "TEAM_VS_TEAM")
		const second = question("mlb", 40, "TEAM_VS_TEAM")
		const prop = question("mlb", 50, "YES_NO_PROP")
		const over = question("mlb", 60, "PLAYER_STAT_OVER_UNDER")

		expect(
			ids(orderGuestPicks([first, second, prop, over], NOW, "mlb")),
		).toEqual(ids([first, prop, over, second]))
	})

	it("falls back to a second game-winner rather than a short stack", () => {
		const first = question("mlb", 30, "TEAM_VS_TEAM")
		const second = question("mlb", 40, "TEAM_VS_TEAM")
		const third = question("mlb", 50, "TEAM_VS_TEAM")

		expect(ids(orderGuestPicks([third, first, second], NOW))).toEqual(
			ids([first, second, third]),
		)
	})

	it("returns what it can when fewer than three are eligible", () => {
		const only = question("nfl", 120)

		expect(ids(orderGuestPicks([only, question("nfl", 5)], NOW))).toEqual(
			ids([only]),
		)
		expect(orderGuestPicks([question("nfl", 5)], NOW)).toEqual([])
		expect(orderGuestPicks([], NOW)).toEqual([])
	})

	it("ignores a league with nothing eligible left in it", () => {
		const nflLocking = question("nfl", 5)
		const mlb30 = question("mlb", 30)

		expect(ids(orderGuestPicks([nflLocking, mlb30], NOW, "nfl"))).toEqual(
			ids([mlb30]),
		)
	})
})

describe("guestPickLeagues", () => {
	it("lists each league once, soonest-locking slate first", () => {
		const leagues = guestPickLeagues(
			[
				question("mlb", 90),
				question("nfl", 40),
				question("mlb", 30),
				question("nba", 60),
			],
			NOW,
		)

		expect(leagues).toEqual([
			{ id: "mlb", abbreviation: "MLB" },
			{ id: "nfl", abbreviation: "NFL" },
			{ id: "nba", abbreviation: "NBA" },
		])
	})

	it("leaves out a league whose only question is about to lock", () => {
		expect(
			guestPickLeagues([question("nfl", 5), question("mlb", 30)], NOW),
		).toEqual([{ id: "mlb", abbreviation: "MLB" }])
	})

	it("is empty when nothing is eligible", () => {
		expect(guestPickLeagues([question("nfl", 5)], NOW)).toEqual([])
		expect(guestPickLeagues([], NOW)).toEqual([])
	})
})

describe("refillSlots", () => {
	const none = new Set<string>()

	it("swaps the whole stack when nothing has been called yet", () => {
		expect(refillSlots(["a", "b", "c"], 0, none, ["x", "y", "z"])).toEqual([
			"x",
			"y",
			"z",
		])
	})

	it("leaves calls already made behind the visitor alone", () => {
		expect(
			refillSlots(["a", "b", "c"], 1, new Set(["a"]), ["x", "y", "z"]),
		).toEqual(["a", "x", "y"])
	})

	it("replaces only the card on screen once every slot is called", () => {
		// Change picks from the summary: all three are called and the visitor is
		// back on the first card. Tapping another sport moves that one pick, not
		// the two behind it.
		const called = new Set(["a", "b", "c"])

		expect(refillSlots(["a", "b", "c"], 0, called, ["x", "y"])).toEqual([
			"x",
			"b",
			"c",
		])
		expect(refillSlots(["a", "b", "c"], 1, called, ["x", "y"])).toEqual([
			"a",
			"x",
			"c",
		])
	})

	it("skips over a later slot that already holds a call", () => {
		expect(refillSlots(["a", "b", "c"], 0, new Set(["c"]), ["x", "y"])).toEqual(
			["x", "y", "c"],
		)
	})

	it("keeps what it cannot replace when the new league runs short", () => {
		expect(refillSlots(["a", "b", "c"], 0, none, ["x"])).toEqual([
			"x",
			"b",
			"c",
		])
		expect(refillSlots(["a", "b", "c"], 0, none, [])).toEqual(["a", "b", "c"])
	})
})
