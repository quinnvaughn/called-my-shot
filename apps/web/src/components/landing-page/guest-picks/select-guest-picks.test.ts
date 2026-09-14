import { describe, expect, it } from "vitest"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { type GuestPickCandidate, orderGuestPicks } from "./select-guest-picks"

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
		league: { id: league },
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

	it("lets leagues take turns, soonest first within each", () => {
		const mlb30 = question("mlb", 30)
		const mlb40 = question("mlb", 40)
		const mlb50 = question("mlb", 50)
		const nfl60 = question("nfl", 60)

		expect(
			ids(orderGuestPicks([mlb50, nfl60, mlb40, mlb30], NOW)),
		).toEqual(ids([mlb30, nfl60, mlb40, mlb50]))
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
})
