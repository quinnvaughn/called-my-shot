import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"
import express from "express"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "../db"
import { seasonPuzzles, teamSeasons } from "../db/schema"
import { addArcadeDays, arcadeDay } from "../lib/arcade/day"
import { loadSeasonPuzzleCardData } from "../lib/share-cards/season-puzzle-card"
import {
	makeTeam,
	makeUser,
	makeUserSeasonStats,
	seedOptionQuestion,
} from "../test/factories"
import { registerShareRoutes } from "./share"

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

let server: ReturnType<ReturnType<typeof express>["listen"]>
let origin: string
let newcomer: string

beforeAll(async () => {
	const app = express()
	registerShareRoutes(app)
	await new Promise<void>((resolve) => {
		server = app.listen(0, () => resolve())
	})
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
	await new Promise((resolve) => server.close(resolve))
})

async function expectPng(path: string) {
	const res = await fetch(`${origin}${path}`)
	expect(res.status).toBe(200)
	expect(res.headers.get("content-type")).toBe("image/png")
	expect(res.headers.get("cache-control")).toBe("public, max-age=300")
	const bytes = new Uint8Array(await res.arrayBuffer())
	expect([...bytes.slice(0, 4)]).toEqual(PNG_SIGNATURE)
}

describe("share routes", () => {
	beforeEach(async () => {
		newcomer = (await makeUser()).username
	})

	it("renders a user's card once they're on the board", async () => {
		const { question, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await makeUserSeasonStats({
			userId: callers[0].user.id,
			leagueId: question.leagueId,
			seasonId: question.seasonId,
			points: 10,
			callCount: 1,
			resolvedCallCount: 1,
			correctCount: 1,
		})
		await expectPng(`/share/users/${callers[0].user.username}.png`)
	})

	it("renders a call's card", async () => {
		const { callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await expectPng(`/share/calls/${callers[0].call.id}.png`)
	})

	it("renders a Name That Season result, keeping the season off it until the day is over", async () => {
		const team = await makeTeam()
		const today = arcadeDay(new Date())
		const yesterday = addArcadeDays(today, -1)
		for (const [year, playDate] of [
			[1995, today],
			[1996, yesterday],
		] as const) {
			const [season] = await db
				.insert(teamSeasons)
				.values({
					leagueId: team.leagueId,
					teamId: team.id,
					year,
					label: String(year),
					name: "Houston Oilers",
					wins: 7,
					losses: 9,
					pointsFor: 348,
					pointsAgainst: 324,
					outcome: "missed",
					leaders: [],
				})
				.returning()
			if (!season) throw new Error("no season")
			await db.insert(seasonPuzzles).values({
				teamSeasonId: season.id,
				clues: Array(6).fill("A clue"),
				playDate,
			})
		}
		await expectPng(`/share/name-that-season/${today}/ryyg.png`)
		await expectPng(`/share/name-that-season/${today}/rryyrr.png`)
		expect((await loadSeasonPuzzleCardData(today, "ryyg"))?.team).toBeNull()
		// A name the link carries that didn't play it isn't put on the card.
		expect(
			(await loadSeasonPuzzleCardData(today, "ryyg", "nobody"))?.sharer,
		).toBeNull()
		expect(
			(await loadSeasonPuzzleCardData(yesterday, "ryyg"))?.team?.name,
		).toBe("1996 Houston Oilers")
		const future = addArcadeDays(today, 1)
		expect(
			(await fetch(`${origin}/share/name-that-season/${future}/g.png`)).status,
		).toBe(404)
		expect(
			(await fetch(`${origin}/share/name-that-season/${today}/gr.png`)).status,
		).toBe(404)
	})

	it.each([
		["an unknown user", () => "/share/users/nobody-here.png"],
		["a user with no calls yet", () => `/share/users/${newcomer}.png`],
		["an unknown call", () => `/share/calls/${randomUUID()}.png`],
		[
			"a ballot that doesn't exist",
			() => "/share/ballots/no-such-ballot/users/nobody.png",
		],
		[
			"a game that doesn't exist",
			() => `/share/games/${randomUUID()}/users/nobody.png`,
		],
		[
			"a streak track that doesn't exist",
			() => "/share/streaks/nobody/nba/winners/hot.png",
		],
	])("404s for %s", async (_label, path) => {
		const res = await fetch(`${origin}${path()}`)
		expect(res.status).toBe(404)
	})
})
