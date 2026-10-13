import { describe, expect, it } from "vitest"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	type GuestPickCandidate,
	guestPickGames,
	guestPickLeagues,
} from "./select-guest-picks"

const NOW = Date.parse("2026-09-13T18:00:00Z")

let n = 0
type Game = { id: string; league: string; away: string; home: string }

function game(league: string): Game {
	n++
	return { id: `game-${n}`, league, away: `away-${n}`, home: `home-${n}` }
}

function question(
	g: Game,
	locksInMinutes: number,
	shape: QuestionShape,
	subjectTeamId: string | null = null,
): GuestPickCandidate {
	n++
	return {
		id: `${g.id}-${shape}-${n}`,
		shape,
		locksAt: new Date(NOW + locksInMinutes * 60_000).toISOString(),
		league: { id: g.league, abbreviation: g.league.toUpperCase() },
		game: { id: g.id, awayTeam: { id: g.away } },
		subjectTeam: subjectTeamId ? { id: subjectTeamId } : null,
	}
}

const winner = (g: Game, locksIn = 60) => question(g, locksIn, "TEAM_VS_TEAM")
const teamTotal = (g: Game, teamId: string, locksIn = 60) =>
	question(g, locksIn, "TEAM_STAT_OVER_UNDER", teamId)
const gameTotal = (g: Game, locksIn = 60) =>
	question(g, locksIn, "GAME_TOTAL_OVER_UNDER")

const ids = (questions: GuestPickCandidate[]) => questions.map((q) => q.id)

describe("guestPickGames", () => {
	it("opens on who wins, then the away team's total, then the home team's", () => {
		const g = game("nfl")
		const home = teamTotal(g, g.home)
		const away = teamTotal(g, g.away)
		const w = winner(g)

		const [stack] = guestPickGames([home, away, gameTotal(g), w], NOW)

		expect(ids(stack.cards)).toEqual(ids([w, away, home]))
	})

	it("fills a game without team totals with the next games' winners", () => {
		const first = game("nba")
		const second = game("nba")
		const third = game("nba")
		const fourth = game("nba")
		const w1 = winner(first, 30)
		const w2 = winner(second, 40)
		const w3 = winner(third, 50)

		const [stack] = guestPickGames(
			[w3, winner(fourth, 60), gameTotal(first), w1, w2],
			NOW,
			"nba",
		)

		expect(ids(stack.cards)).toEqual(ids([w1, w2, w3]))
	})

	it("borrows another league's winners once the selected one runs short", () => {
		const nba = game("nba")
		const nhl = game("nhl")
		const wNba = winner(nba, 3000)
		const wNhl = winner(nhl, 30)

		const [stack] = guestPickGames([wNhl, wNba], NOW, "nba")

		expect(ids(stack.cards)).toEqual(ids([wNba, wNhl]))
	})

	it("keeps a game with team totals to its own cards", () => {
		const g = game("nfl")
		const w = winner(g, 30)
		const away = teamTotal(g, g.away, 30)

		const [stack] = guestPickGames(
			[w, away, winner(game("nfl"), 40)],
			NOW,
			"nfl",
		)

		expect(ids(stack.cards)).toEqual(ids([w, away]))
	})

	it("offers the winner alone when there is no other game", () => {
		const g = game("nba")
		const w = winner(g)

		expect(ids(guestPickGames([w], NOW)[0].cards)).toEqual(ids([w]))
	})

	it("drops a game whose winner isn't callable", () => {
		const locking = game("nfl")
		const orphan = game("nfl")

		expect(
			guestPickGames(
				[winner(locking, 19), teamTotal(orphan, orphan.away)],
				NOW,
			),
		).toEqual([])
	})

	it("keeps one total per team", () => {
		const g = game("nhl")
		const w = winner(g)
		const first = teamTotal(g, g.away)

		expect(
			ids(guestPickGames([w, first, teamTotal(g, g.away)], NOW)[0].cards),
		).toEqual(ids([w, first]))
	})

	it("orders games soonest first", () => {
		const later = game("nfl")
		const sooner = game("nfl")

		expect(
			guestPickGames([winner(later, 120), winner(sooner, 30)], NOW).map(
				(g) => g.id,
			),
		).toEqual([sooner.id, later.id])
	})

	it("exhausts the selected league before any other", () => {
		const mlb1 = game("mlb")
		const mlb2 = game("mlb")
		const nfl = game("nfl")

		expect(
			guestPickGames(
				[winner(mlb1, 30), winner(mlb2, 40), winner(nfl, 600)],
				NOW,
				"nfl",
			).map((g) => g.id),
		).toEqual([nfl.id, mlb1.id, mlb2.id])
	})

	it("lets the other leagues take turns", () => {
		const mlb1 = game("mlb")
		const mlb2 = game("mlb")
		const nhl = game("nhl")

		expect(
			guestPickGames(
				[winner(mlb1, 30), winner(mlb2, 40), winner(nhl, 50)],
				NOW,
			).map((g) => g.id),
		).toEqual([mlb1.id, nhl.id, mlb2.id])
	})
})

describe("guestPickLeagues", () => {
	it("lists each league once, soonest game first", () => {
		expect(
			guestPickLeagues(
				[
					winner(game("mlb"), 90),
					winner(game("nfl"), 40),
					winner(game("mlb"), 30),
					winner(game("nba"), 60),
				],
				NOW,
			),
		).toEqual([
			{ id: "mlb", abbreviation: "MLB" },
			{ id: "nfl", abbreviation: "NFL" },
			{ id: "nba", abbreviation: "NBA" },
		])
	})

	it("leaves out a league with no callable winner", () => {
		const nfl = game("nfl")
		expect(
			guestPickLeagues(
				[winner(nfl, 5), teamTotal(nfl, nfl.away), winner(game("mlb"), 30)],
				NOW,
			),
		).toEqual([{ id: "mlb", abbreviation: "MLB" }])
	})

	it("is empty when nothing is eligible", () => {
		expect(guestPickLeagues([winner(game("nfl"), 5)], NOW)).toEqual([])
		expect(guestPickLeagues([], NOW)).toEqual([])
	})
})
