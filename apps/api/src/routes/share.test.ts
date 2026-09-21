import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"
import express from "express"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
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

	it.each([
		["an unknown user", () => "/share/users/nobody-here.png"],
		["a user with no calls yet", () => `/share/users/${newcomer}.png`],
		["an unknown call", () => `/share/calls/${randomUUID()}.png`],
		[
			"a ballot that doesn't exist",
			() => "/share/ballots/no-such-ballot/users/nobody.png",
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
