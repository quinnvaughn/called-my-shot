import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../db"
import { callSelections, pointAwards, questionOptions } from "../db/schema"
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
} from "../test/factories"
import {
	buildUserRecord,
	calendarRange,
	loadUserRecordInputs,
} from "./user-record"

let userId: string

beforeEach(async () => {
	userId = (await makeUser()).id
})

// One settled option-shape call. The points land on the selection, leaving
// calls.result_points null, which is how every option shape really scores.
async function optionCall(opts: {
	league: League
	seasonId: string
	gameId: string | null
	points: number
	resolvedAt?: Date
}) {
	const question = await makeQuestion({
		leagueId: opts.league.id,
		seasonId: opts.seasonId,
		gameId: opts.gameId,
		status: "resolved",
		resolvedAt: opts.resolvedAt ?? new Date(),
	})
	const picked = await makeOption(question.id, { label: "Yes", sortOrder: 0 })
	await makeOption(question.id, { label: "No", sortOrder: 1 })
	await db
		.update(questionOptions)
		.set({ isCorrect: opts.points > 0 })
		.where(eq(questionOptions.id, picked.id))
	const call = await makeCall(question.id, userId)
	await makeSelection(call.id, picked.id, 50)
	await db
		.update(callSelections)
		.set({ resultPoints: opts.points })
		.where(eq(callSelections.callId, call.id))
}

describe("calendarRange", () => {
	it("starts on the Sunday weeks-1 before this week's and ends today, ET", () => {
		// Wednesday 2026-09-23, 10pm ET, already Thursday in UTC.
		const range = calendarRange(new Date("2026-09-24T02:00:00Z"), 2)
		expect(range).toEqual({ startDay: "2026-09-13", endDay: "2026-09-23" })
	})

	it("counts a Sunday as the start of its own week", () => {
		const range = calendarRange(new Date("2026-09-20T16:00:00Z"), 1)
		expect(range).toEqual({ startDay: "2026-09-20", endDay: "2026-09-20" })
	})
})

describe("loadUserRecordInputs + buildUserRecord", () => {
	const now = new Date("2026-09-24T16:00:00Z")

	it("puts a call on its game's ET day and links a date league to that day", async () => {
		const league = await makeLeague({ windowType: "date" })
		const seasonId = (await makeSeason({ leagueId: league.id })).id
		// 11pm ET on the 22nd is the 23rd in UTC.
		const game = await makeGame({
			leagueId: league.id,
			seasonId,
			startsAt: new Date("2026-09-23T03:00:00Z"),
		})
		await optionCall({ league, seasonId, gameId: game.id, points: 60 })

		const record = buildUserRecord(await loadUserRecordInputs(userId), {
			leagueId: null,
			weeks: 2,
			now,
		})
		expect(record.calendar.days).toHaveLength(1)
		const day = record.calendar.days[0]
		expect(day?.day).toBe("2026-09-22")
		expect(day?.netPoints).toBe(60)
		expect(day?.leagues[0]?.windowKey).toBe("2026-09-22")
	})

	it("links a week league's day to its week's report card", async () => {
		const league = await makeLeague({ windowType: "week" })
		const seasonId = (await makeSeason({ leagueId: league.id, year: 2026 })).id
		const game = await makeGame({
			leagueId: league.id,
			seasonId,
			seasonType: "regular",
			weekNumber: 3,
			startsAt: new Date("2026-09-20T17:00:00Z"),
		})
		await optionCall({ league, seasonId, gameId: game.id, points: -40 })

		const record = buildUserRecord(await loadUserRecordInputs(userId), {
			leagueId: null,
			weeks: 2,
			now,
		})
		expect(record.calendar.days[0]?.leagues[0]?.windowKey).toBe("2026-reg-w3")
	})

	it("places a gameless call on the day it resolved, with no window", async () => {
		const league = await makeLeague({ windowType: "date" })
		const seasonId = (await makeSeason({ leagueId: league.id })).id
		await optionCall({
			league,
			seasonId,
			gameId: null,
			points: 90,
			resolvedAt: new Date("2026-09-21T15:00:00Z"),
		})

		const record = buildUserRecord(await loadUserRecordInputs(userId), {
			leagueId: null,
			weeks: 2,
			now,
		})
		expect(record.calendar.days[0]?.day).toBe("2026-09-21")
		expect(record.calendar.days[0]?.leagues[0]?.windowKey).toBeNull()
	})

	it("adds up to the scope's points: calls net plus bonuses, per league and overall", async () => {
		const nba = await makeLeague({ windowType: "date" })
		const nbaSeason = (await makeSeason({ leagueId: nba.id })).id
		const nfl = await makeLeague({ windowType: "week" })
		const nflSeason = (await makeSeason({ leagueId: nfl.id })).id
		const nbaGame = await makeGame({ leagueId: nba.id, seasonId: nbaSeason })
		await optionCall({
			league: nba,
			seasonId: nbaSeason,
			gameId: nbaGame.id,
			points: 120,
		})
		await optionCall({
			league: nba,
			seasonId: nbaSeason,
			gameId: nbaGame.id,
			points: -50,
		})
		const nflGame = await makeGame({ leagueId: nfl.id, seasonId: nflSeason })
		await optionCall({
			league: nfl,
			seasonId: nflSeason,
			gameId: nflGame.id,
			points: -30,
		})
		await db.insert(pointAwards).values({
			userId,
			leagueId: nba.id,
			seasonId: nbaSeason,
			kind: "sweep",
			scopeKey: "s",
			sourceKey: "u",
			points: 25,
		})

		const inputs = await loadUserRecordInputs(userId)
		const career = buildUserRecord(inputs, { leagueId: null, weeks: 2, now })
		expect(career.netFromCalls).toBe(40)
		expect(career.bonusPoints).toBe(25)
		expect(career.wins).toBe(1)
		expect(career.losses).toBe(2)
		// Best net first.
		expect(
			career.byLeague.map((row) => [row.league.id, row.netPoints]),
		).toEqual([
			[nba.id, 70],
			[nfl.id, -30],
		])

		const nbaOnly = buildUserRecord(inputs, { leagueId: nba.id, weeks: 2, now })
		expect(nbaOnly.netFromCalls).toBe(70)
		expect(nbaOnly.bonusPoints).toBe(25)
		expect(nbaOnly.byLeague).toEqual([])
		expect(nbaOnly.byFamily.reduce((sum, row) => sum + row.netPoints, 0)).toBe(
			70,
		)
	})
})
