import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../../db"
import { callSelections, questionOptions } from "../../../db/schema"
import {
	type League,
	makeCall,
	makeGame,
	makeLeague,
	makeOption,
	makeQuestion,
	makeSeason,
	makeSelection,
	makeUser,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"

type ReportCard = {
	windowKey: string
	windowLabel: string
	settledCount: number
	pendingCount: number
	wins: number
	losses: number
	netPoints: number
	isFinal: boolean
	returnPct: number | null
	grade: string | null
	biggestHit: { id: string } | null
	biggestMiss: { id: string } | null
	bestGame: ReportCardGame | null
	worstGame: ReportCardGame | null
	byFamily: unknown[]
	byShape: unknown[]
}
type ReportCardGame = {
	game: { id: string }
	netPoints: number
	wins: number
	losses: number
}
type UserReportCard = { userByUsername: { reportCard: ReportCard | null } }
type WindowReportCard = {
	leagueGamesForWindow: {
		window: { key: string }
		viewerReportCard: ReportCard | null
	}
}

let league: League
let seasonId: string
let user: Awaited<ReturnType<typeof makeUser>>

beforeEach(async () => {
	league = await makeLeague({ windowType: "week", slug: `wk-${Date.now()}` })
	seasonId = (await makeSeason({ leagueId: league.id, year: 2026 })).id
	user = await makeUser()
})

const gameInWeek = () =>
	makeGame({
		leagueId: league.id,
		seasonId,
		seasonType: "regular",
		weekNumber: 3,
	})

async function settledCall(
	points: number,
	correct: boolean,
	game?: { id: string },
) {
	game ??= await gameInWeek()
	const question = await makeQuestion({
		leagueId: league.id,
		seasonId,
		gameId: game.id,
		status: "resolved",
	})
	const picked = await makeOption(question.id, { label: "Yes" })
	await db
		.update(questionOptions)
		.set({ isCorrect: correct })
		.where(eq(questionOptions.id, picked.id))
	const call = await makeCall(question.id, user.id)
	await makeSelection(call.id, picked.id, 50)
	await db
		.update(callSelections)
		.set({ resultPoints: points })
		.where(eq(callSelections.callId, call.id))
	return call
}

const USER_REPORT_CARD = /* GraphQL */ `
	query UserReportCard($username: String!, $league: String!, $key: String!) {
		userByUsername(username: $username) {
			id
			reportCard(league: $league, windowKey: $key) {
				windowKey
				windowLabel
				settledCount
				wins
				losses
				netPoints
				committedPoints
				returnPct
				grade
				isFinal
				byFamily { family label wins losses netPoints }
				byShape { shape family label }
				biggestHit { id }
				biggestMiss { id }
				bestGame { game { id } netPoints wins losses }
				worstGame { game { id } netPoints wins losses }
			}
		}
	}
`

describe("User.reportCard", () => {
	it("returns the window's card for any viewer, signed out included", async () => {
		const big = await settledCall(400, true)
		const miss = await settledCall(-75, false)
		await settledCall(75, true)

		const data = await expectData<UserReportCard>(USER_REPORT_CARD, {
			variables: {
				username: user.username,
				league: league.slug,
				key: "2026-reg-w3",
			},
		})
		const card = data.userByUsername.reportCard
		expect(card?.windowKey).toBe("2026-reg-w3")
		expect(card?.windowLabel).toBe("WEEK 3")
		expect(card?.settledCount).toBe(3)
		expect(card?.wins).toBe(2)
		expect(card?.losses).toBe(1)
		expect(card?.netPoints).toBe(400)
		expect(card?.isFinal).toBe(true)
		expect(card?.biggestHit?.id).toBe(big.id)
		expect(card?.biggestMiss?.id).toBe(miss.id)
		// Three settled calls is under REPORT_CARD_MIN_SETTLED, so the return
		// is real but the letter is withheld.
		expect(card?.returnPct).toBeGreaterThan(0)
		expect(card?.grade).toBeNull()
	})

	it("picks a best and worst game from each game's netted calls", async () => {
		const up = await gameInWeek()
		const down = await gameInWeek()
		await settledCall(300, true, up)
		await settledCall(-75, false, up)
		await settledCall(-150, false, down)

		const data = await expectData<UserReportCard>(USER_REPORT_CARD, {
			variables: {
				username: user.username,
				league: league.slug,
				key: "2026-reg-w3",
			},
		})
		const card = data.userByUsername.reportCard
		expect(card?.bestGame).toEqual({
			game: { id: up.id },
			netPoints: 225,
			wins: 1,
			losses: 1,
		})
		expect(card?.worstGame).toEqual({
			game: { id: down.id },
			netPoints: -150,
			wins: 0,
			losses: 1,
		})
	})

	it("labels its breakdown rows", async () => {
		await settledCall(75, true)
		const data = await expectData<UserReportCard>(USER_REPORT_CARD, {
			variables: {
				username: user.username,
				league: league.slug,
				key: "2026-reg-w3",
			},
		})
		const card = data.userByUsername.reportCard
		// toEqual, not toStrictEqual - a GraphQL response builds its objects
		// with a null prototype, which toStrictEqual treats as a mismatch even
		// when every value is identical.
		expect(card?.byFamily).toEqual([
			{
				family: "YES_NO",
				label: "Yes/No",
				wins: 1,
				losses: 0,
				netPoints: 75,
			},
		])
		expect(card?.byShape[0]).toEqual({
			shape: "YES_NO_PROP",
			family: "YES_NO",
			label: "Yes/No",
		})
	})

	it("is an empty card, not null, for a window the user sat out", async () => {
		await makeGame({
			leagueId: league.id,
			seasonId,
			seasonType: "regular",
			weekNumber: 3,
		})
		const data = await expectData<UserReportCard>(USER_REPORT_CARD, {
			variables: {
				username: user.username,
				league: league.slug,
				key: "2026-reg-w3",
			},
		})
		const card = data.userByUsername.reportCard
		// Still names the window, so the page can say which one it found
		// nothing for.
		expect(card?.windowLabel).toBe("WEEK 3")
		expect(card?.settledCount).toBe(0)
		expect(card?.pendingCount ?? 0).toBe(0)
		expect(card?.byFamily).toEqual([])
		expect(card?.grade).toBeNull()
	})

	it("is null for a key that names no window - the permalink's 404", async () => {
		await settledCall(75, true)
		for (const key of ["2026-reg-w99", "nonsense", "not-a-key"]) {
			const data = await expectData<UserReportCard>(USER_REPORT_CARD, {
				variables: { username: user.username, league: league.slug, key },
			})
			expect(data.userByUsername.reportCard).toBeNull()
		}
	})

	it("is null for a league that does not exist", async () => {
		const data = await expectData<UserReportCard>(USER_REPORT_CARD, {
			variables: {
				username: user.username,
				league: "no-such-league",
				key: "2026-reg-w3",
			},
		})
		expect(data.userByUsername.reportCard).toBeNull()
	})
})

const VIEWER_REPORT_CARD = /* GraphQL */ `
	query ViewerReportCard($leagueId: ID!, $key: String) {
		leagueGamesForWindow(leagueId: $leagueId, windowKey: $key) {
			window { key }
			viewerReportCard {
				windowKey
				settledCount
				netPoints
			}
		}
	}
`

describe("LeagueGamesForWindowResult.viewerReportCard", () => {
	it("is scoped to the window the stepper selected", async () => {
		await settledCall(120, true)

		const data = await expectData<WindowReportCard>(VIEWER_REPORT_CARD, {
			as: user,
			variables: { leagueId: league.id, key: "2026-reg-w3" },
		})
		const result = data.leagueGamesForWindow
		expect(result.window.key).toBe("2026-reg-w3")
		expect(result.viewerReportCard?.windowKey).toBe("2026-reg-w3")
		expect(result.viewerReportCard?.settledCount).toBe(1)
		expect(result.viewerReportCard?.netPoints).toBe(120)
	})

	it("is null signed out", async () => {
		await settledCall(120, true)
		const result = await execute(VIEWER_REPORT_CARD, {
			variables: { leagueId: league.id, key: "2026-reg-w3" },
		})
		expect(
			(result.data as WindowReportCard | undefined)?.leagueGamesForWindow
				.viewerReportCard,
		).toBeNull()
	})
})
