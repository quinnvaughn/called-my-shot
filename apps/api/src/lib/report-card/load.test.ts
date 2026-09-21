import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../db"
import { callSelections, questionOptions } from "../../db/schema"
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
} from "../../test/factories"
import { getLeagueWindows, type WindowDescriptor } from "../windows"
import { loadReportCard } from "./load"

let league: League
let seasonId: string
let userId: string

const WEEK = { seasonType: "regular" as const, weekNumber: 3 }

beforeEach(async () => {
	league = await makeLeague({ windowType: "week" })
	seasonId = (await makeSeason({ leagueId: league.id, year: 2026 })).id
	userId = (await makeUser()).id
})

async function windowFor(
	target: League = league,
	key?: string,
): Promise<WindowDescriptor> {
	const windows = await getLeagueWindows(target)
	const found = key ? windows.find((w) => w.key === key) : windows[0]
	if (!found) throw new Error(`no window${key ? ` ${key}` : ""}`)
	return found
}

const gameInWeek = () => makeGame({ leagueId: league.id, seasonId, ...WEEK })

/**
 * One settled option-shape call by `userId`. The points land on the
 * SELECTION, leaving calls.result_points null - which is how every
 * option-shape call really scores, and the case this loader has to get right.
 */
async function optionCall(opts: {
	gameId: string
	correct?: boolean
	points?: number | null
	conviction?: number
	status?: "open" | "resolved" | "disputed" | "voided"
	isOfficial?: boolean
	leagueId?: string
	seasonId?: string
	callerId?: string
}) {
	const question = await makeQuestion({
		leagueId: opts.leagueId ?? league.id,
		seasonId: opts.seasonId ?? seasonId,
		gameId: opts.gameId,
		status: opts.status ?? "resolved",
		...(opts.isOfficial === undefined ? {} : { isOfficial: opts.isOfficial }),
	})
	const picked = await makeOption(question.id, { label: "Yes", sortOrder: 0 })
	await makeOption(question.id, { label: "No", sortOrder: 1 })
	if (opts.correct !== undefined) {
		await db
			.update(questionOptions)
			.set({ isCorrect: opts.correct })
			.where(eq(questionOptions.id, picked.id))
	}
	const call = await makeCall(question.id, opts.callerId ?? userId)
	await makeSelection(call.id, picked.id, opts.conviction ?? 50)
	if (opts.points !== undefined && opts.points !== null) {
		await db
			.update(callSelections)
			.set({ resultPoints: opts.points })
			.where(eq(callSelections.callId, call.id))
	}
	return { question, call }
}

describe("loadReportCard", () => {
	it("reads points off the selection, not the null call column", async () => {
		// The whole reason this loader exists. An option-shape call leaves
		// calls.result_points null and scores through call_selections, so a
		// loader reading the call column would report net 0 here and grade
		// every caller at break-even.
		const game = await gameInWeek()
		await optionCall({ gameId: game.id, correct: true, points: 120 })

		const card = await loadReportCard(userId, league, await windowFor())
		expect(card.settledCount).toBe(1)
		expect(card.wins).toBe(1)
		expect(card.netPoints).toBe(120)
		expect(card.committedPoints).toBe(75) // 150 base x 50 conviction
		expect(card.returnPct).toBeCloseTo(160)
	})

	it("counts a community question exactly like an official one", async () => {
		const game = await gameInWeek()
		await optionCall({
			gameId: game.id,
			correct: true,
			points: 75,
			isOfficial: true,
		})
		await optionCall({
			gameId: game.id,
			correct: true,
			points: 75,
			isOfficial: false,
		})

		const card = await loadReportCard(userId, league, await windowFor())
		expect(card.settledCount).toBe(2)
		expect(card.netPoints).toBe(150)
	})

	it("leaves out a season-long call with no game, made in the same week", async () => {
		const game = await gameInWeek()
		await optionCall({ gameId: game.id, correct: true, points: 75 })

		const mvpRace = await makeQuestion({
			leagueId: league.id,
			seasonId,
			shape: "player_season_award",
			status: "resolved",
		})
		const option = await makeOption(mvpRace.id, { label: "Someone" })
		const call = await makeCall(mvpRace.id, userId)
		await makeSelection(call.id, option.id, 100)

		const card = await loadReportCard(userId, league, await windowFor())
		expect(card.settledCount).toBe(1)
		expect(card.byFamily.map((r) => r.family)).not.toContain("AWARD")
	})

	// The three ways a window can come back empty. They are deliberately not
	// distinguished: "this caller has nothing that counts for this window" is
	// the only true sentence in all three, and both surfaces read the same
	// zero counts off it.
	it("is empty, not absent, when another caller made the only calls", async () => {
		const game = await gameInWeek()
		const other = await makeUser()
		await optionCall({
			gameId: game.id,
			correct: true,
			points: 75,
			callerId: other.id,
		})

		const card = await loadReportCard(userId, league, await windowFor())
		expect(card.settledCount + card.pendingCount).toBe(0)
		expect(card.returnPct).toBeNull()
		expect(card.grade).toBeNull()
	})

	it("is empty when the viewer called nothing in the window", async () => {
		await gameInWeek()
		const card = await loadReportCard(userId, league, await windowFor())
		expect(card.settledCount + card.pendingCount).toBe(0)
		expect(card.byFamily).toStrictEqual([])
	})

	it("is empty when every call in the window was voided", async () => {
		const game = await gameInWeek()
		await optionCall({ gameId: game.id, correct: true, status: "voided" })
		const card = await loadReportCard(userId, league, await windowFor())
		expect(card.settledCount + card.pendingCount).toBe(0)
		expect(card.biggestHitCallId).toBeNull()
		expect(card.isFinal).toBe(false)
	})

	it("counts an open call as pending, with a stake and no grade", async () => {
		const game = await gameInWeek()
		await optionCall({ gameId: game.id, status: "open", conviction: 40 })

		const card = await loadReportCard(userId, league, await windowFor())
		expect(card.pendingCount).toBe(1)
		expect(card.settledCount).toBe(0)
		expect(card.pendingStake).toBe(60) // 150 x 40 conviction x lossRate 1
		expect(card.returnPct).toBeNull()
		expect(card.grade).toBeNull()
		expect(card.isFinal).toBe(false)
	})

	it("reads a numeric guess off the call row, where its points really live", async () => {
		const game = await gameInWeek()
		const question = await makeQuestion({
			leagueId: league.id,
			seasonId,
			gameId: game.id,
			shape: "player_stat_numeric_guess",
			status: "resolved",
		})
		await makeCall(question.id, userId, {
			guessValue: 250,
			conviction: 60,
			hitTolerance: true,
			resultPoints: 300,
		})

		const card = await loadReportCard(userId, league, await windowFor())
		expect(card.settledCount).toBe(1)
		expect(card.wins).toBe(1)
		expect(card.netPoints).toBe(300)
		expect(card.committedPoints).toBe(150) // 250 base x 60, off the call
	})

	it("picks the biggest hit and biggest miss across the window", async () => {
		const gameA = await gameInWeek()
		const gameB = await gameInWeek()
		await optionCall({ gameId: gameA.id, correct: true, points: 40 })
		const big = await optionCall({
			gameId: gameB.id,
			correct: true,
			points: 400,
		})
		const miss = await optionCall({
			gameId: gameB.id,
			correct: false,
			points: -75,
		})

		const card = await loadReportCard(userId, league, await windowFor())
		expect(card.biggestHitCallId).toBe(big.call.id)
		expect(card.biggestMissCallId).toBe(miss.call.id)
	})

	it("selects a week league's games by week, not by a time range", async () => {
		// A kickoff outside ESPN's published week boundary is still in the
		// week, and the Games tab lists it. The card has to grade it too, or
		// the two disagree about the same slate.
		const outlier = await makeGame({
			leagueId: league.id,
			seasonId,
			...WEEK,
			startsAt: new Date("2030-01-01T00:00:00Z"),
		})
		await optionCall({ gameId: outlier.id, correct: true, points: 75 })

		const card = await loadReportCard(
			userId,
			league,
			await windowFor(league, "2026-reg-w3"),
		)
		expect(card.settledCount).toBe(1)
	})
})

describe("loadReportCard for a date league", () => {
	it("scopes to one ET day", async () => {
		const dateLeague = await makeLeague({ windowType: "date" })
		const dateSeasonId = (await makeSeason({ leagueId: dateLeague.id })).id
		const viewer = await makeUser()

		for (const startsAt of [
			new Date("2026-09-20T18:00:00Z"),
			new Date("2026-09-22T18:00:00Z"),
		]) {
			const game = await makeGame({
				leagueId: dateLeague.id,
				seasonId: dateSeasonId,
				startsAt,
			})
			await optionCall({
				gameId: game.id,
				correct: true,
				points: 75,
				leagueId: dateLeague.id,
				seasonId: dateSeasonId,
				callerId: viewer.id,
			})
		}

		const card = await loadReportCard(
			viewer.id,
			dateLeague,
			await windowFor(dateLeague, "2026-09-20"),
		)
		// The game on that day only, not the one two days later.
		expect(card.settledCount).toBe(1)
	})
})
