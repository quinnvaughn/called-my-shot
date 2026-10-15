import { describe, expect, it } from "vitest"
import { db } from "../db"
import { type User, userBlocks } from "../db/schema"
import {
	makeCall,
	makeGame,
	makeGroup,
	makeQuestion,
	makeUser,
} from "../test/factories"
import { expectData } from "../test/graphql"
import { GROUP_CALLER_PREVIEW } from "./game-callers"

const CALLERS = /* GraphQL */ `
	query Callers($id: ID!) {
		game(id: $id) {
			callerCount
			viewerCalledCount
			viewerGroupCallers { count preview { id } }
		}
	}
`

type CallersData = {
	game: {
		callerCount: number
		viewerCalledCount: number | null
		viewerGroupCallers: { count: number; preview: { id: string }[] }
	}
}

async function gameQuestion(game: {
	id: string
	leagueId: string
	seasonId: string
}) {
	return makeQuestion({
		leagueId: game.leagueId,
		seasonId: game.seasonId,
		gameId: game.id,
	})
}

async function callers(gameId: string, as: User | null) {
	const data = await expectData<CallersData>(CALLERS, {
		as,
		variables: { id: gameId },
	})
	return data.game
}

describe("Game callers", () => {
	it("counts each caller once, however many questions they called", async () => {
		const viewer = await makeUser()
		const other = await makeUser()
		const game = await makeGame()
		const first = await gameQuestion(game)
		const second = await gameQuestion(game)
		await makeCall(first.id, viewer.id)
		await makeCall(second.id, viewer.id)
		await makeCall(first.id, other.id)

		const result = await callers(game.id, viewer)
		expect(result.callerCount).toBe(2)
		expect(result.viewerCalledCount).toBe(2)
	})

	it("shows group callers, leaving out the viewer, strangers and blocked users", async () => {
		const viewer = await makeUser()
		const friend = await makeUser()
		const blockedFriend = await makeUser()
		const stranger = await makeUser()
		await makeGroup({ admin: viewer, members: [friend, blockedFriend] })
		await db
			.insert(userBlocks)
			.values({ blockerId: viewer.id, blockedId: blockedFriend.id })
		const game = await makeGame()
		const question = await gameQuestion(game)
		for (const user of [viewer, friend, blockedFriend, stranger]) {
			await makeCall(question.id, user.id)
		}

		const result = await callers(game.id, viewer)
		expect(result.callerCount).toBe(4)
		expect(result.viewerGroupCallers).toEqual({
			count: 1,
			preview: [{ id: friend.id }],
		})
	})

	it("caps the preview but counts every group caller, most recent first", async () => {
		const viewer = await makeUser()
		const members = await Promise.all(
			Array.from({ length: GROUP_CALLER_PREVIEW + 2 }, () => makeUser()),
		)
		await makeGroup({ admin: viewer, members })
		const game = await makeGame()
		const question = await gameQuestion(game)
		const start = Date.now() - 60 * 60 * 1000
		for (const [i, member] of members.entries()) {
			await makeCall(question.id, member.id, {
				createdAt: new Date(start + i * 60 * 1000),
			})
		}

		const result = await callers(game.id, viewer)
		expect(result.viewerGroupCallers.count).toBe(members.length)
		expect(result.viewerGroupCallers.preview.map((u) => u.id)).toEqual(
			members
				.slice(-GROUP_CALLER_PREVIEW)
				.reverse()
				.map((u) => u.id),
		)
	})

	it("keeps the counts apart when one request asks for several games", async () => {
		const viewer = await makeUser()
		const friend = await makeUser()
		await makeGroup({ admin: viewer, members: [friend] })
		const called = await makeGame()
		const quiet = await makeGame()
		await makeCall((await gameQuestion(called)).id, friend.id)
		await gameQuestion(quiet)

		const fields = "callerCount viewerGroupCallers { count }"
		const data = await expectData<{
			a: { callerCount: number; viewerGroupCallers: { count: number } }
			b: { callerCount: number; viewerGroupCallers: { count: number } }
		}>(
			`query Two($a: ID!, $b: ID!) {
				a: game(id: $a) { ${fields} }
				b: game(id: $b) { ${fields} }
			}`,
			{ as: viewer, variables: { a: called.id, b: quiet.id } },
		)
		expect(data.a).toEqual({ callerCount: 1, viewerGroupCallers: { count: 1 } })
		expect(data.b).toEqual({ callerCount: 0, viewerGroupCallers: { count: 0 } })
	})

	it("returns no viewer counts when signed out", async () => {
		const game = await makeGame()
		await makeCall((await gameQuestion(game)).id, (await makeUser()).id)

		const result = await callers(game.id, null)
		expect(result).toEqual({
			callerCount: 1,
			viewerCalledCount: null,
			viewerGroupCallers: { count: 0, preview: [] },
		})
	})
})
