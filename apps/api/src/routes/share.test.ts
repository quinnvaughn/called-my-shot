import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"
import express from "express"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "../db"
import {
	posts,
	prompts,
	rankPuzzles,
	rushmorePicks,
	seasonPuzzles,
	teamSeasons,
} from "../db/schema"
import { addArcadeDays, arcadeDay } from "../lib/arcade/day"
import { loadSeasonPuzzleCardData } from "../lib/share-cards/season-puzzle-card"
import {
	makeGroup,
	makeLeague,
	makePlayer,
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

// A franchise prompt and one Rushmore answering it, public unless a group
// or a removal says otherwise.
async function seedRushmore(
	opts: { groupId?: string; removedAt?: Date; code?: string } = {},
) {
	const team = await makeTeam()
	const author = await makeUser()
	const [prompt] = await db
		.insert(prompts)
		.values({
			kind: "rushmore",
			code: opts.code ?? `p${randomUUID().slice(0, 8)}`,
			title: "Celtics Rushmore",
			leagueId: team.leagueId,
			teamId: team.id,
		})
		.returning()
	if (!prompt) throw new Error("no prompt")
	const [post] = await db
		.insert(posts)
		.values({
			kind: "rushmore",
			authorId: author.id,
			promptId: prompt.id,
			groupId: opts.groupId ?? null,
			removedAt: opts.removedAt ?? null,
		})
		.returning()
	if (!post) throw new Error("no post")
	const picks = await Promise.all(
		["Bill Russell", "Larry Bird", "John Havlicek", "Paul Pierce"].map((name) =>
			makePlayer({ name }),
		),
	)
	await db.insert(rushmorePicks).values(
		picks.map((player, position) => ({
			postId: post.id,
			playerId: player.id,
			position,
		})),
	)
	return { prompt, post, author }
}

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
		// Today's puzzle, as the game page previews it.
		await expectPng(`/share/name-that-season/${today}.png`)
		const future = addArcadeDays(today, 1)
		expect(
			(await fetch(`${origin}/share/name-that-season/${future}.png`)).status,
		).toBe(404)
		expect(
			(await fetch(`${origin}/share/name-that-season/${future}/g.png`)).status,
		).toBe(404)
		expect(
			(await fetch(`${origin}/share/name-that-season/${today}/gr.png`)).status,
		).toBe(404)
	})

	it("renders Blind Rank's result and today's puzzle, but not a day to come", async () => {
		const league = await makeLeague()
		const today = arcadeDay(new Date())
		await db.insert(rankPuzzles).values({
			leagueId: league.id,
			kind: "career_stat",
			prompt: "Career sacks",
			context: "NFL",
			items: [50, 40, 30, 20, 10].map((value) => ({
				label: `Player ${value}`,
				sublabel: null,
				teamId: null,
				value,
				display: String(value),
			})),
			signature: `share-test:${today}`,
			playDate: today,
		})
		await expectPng(`/share/blind-rank/${today}/grgrg.png`)
		await expectPng(`/share/blind-rank/${today}.png`)
		const future = addArcadeDays(today, 1)
		expect(
			(await fetch(`${origin}/share/blind-rank/${future}.png`)).status,
		).toBe(404)
	})

	it("renders a public Rushmore in both sizes, and its prompt's crowd card", async () => {
		const { prompt, post } = await seedRushmore()
		await expectPng(`/share/rushmore/${post.id}.png`)
		await expectPng(`/share/rushmore/${post.id}/portrait.png`)
		await expectPng(`/share/rushmore-prompts/${prompt.code}.png`)
	})

	it("keeps group and removed Rushmores off share images", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		const inGroup = await seedRushmore({ groupId: group.id })
		const removed = await seedRushmore({ removedAt: new Date() })
		for (const { post } of [inGroup, removed]) {
			for (const path of [
				`/share/rushmore/${post.id}.png`,
				`/share/rushmore/${post.id}/portrait.png`,
			]) {
				expect((await fetch(`${origin}${path}`)).status).toBe(404)
			}
		}
		// Neither counts as an answer, so their prompts have no crowd yet.
		for (const { prompt } of [inGroup, removed]) {
			expect(
				(await fetch(`${origin}/share/rushmore-prompts/${prompt.code}.png`))
					.status,
			).toBe(404)
		}
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
		["an unknown Rushmore", () => `/share/rushmore/${randomUUID()}.png`],
		["a malformed Rushmore id", () => "/share/rushmore/not-a-uuid.png"],
		["an unknown prompt", () => "/share/rushmore-prompts/no-such-code.png"],
	])("404s for %s", async (_label, path) => {
		const res = await fetch(`${origin}${path()}`)
		expect(res.status).toBe(404)
	})
})
