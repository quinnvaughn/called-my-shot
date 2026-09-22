import { describe, expect, it } from "vitest"
import {
	makeCall,
	makeGame,
	makeOption,
	makeQuestion,
	makeSelection,
	makeUser,
} from "../test/factories"
import { expectData } from "../test/graphql"

const ENTRY = /* GraphQL */ `
	query Entry($id: ID!, $username: String!) {
		game(id: $id) {
			entry(username: $username) {
				calledCount
				user { username }
				members {
					question { id }
					call { id }
				}
			}
		}
	}
`

type EntryData = {
	game: {
		entry: {
			calledCount: number
			user: { username: string }
			members: { question: { id: string }; call: { id: string } | null }[]
		} | null
	}
}

async function seedGame() {
	const game = await makeGame()
	const scope = {
		leagueId: game.leagueId,
		seasonId: game.seasonId,
		gameId: game.id,
	}
	const first = await makeQuestion({
		...scope,
		isOfficial: true,
		createdAt: new Date(Date.now() - 2000),
	})
	const second = await makeQuestion({
		...scope,
		isOfficial: true,
		createdAt: new Date(Date.now() - 1000),
	})
	const community = await makeQuestion({ ...scope, isOfficial: false })
	const options = new Map<string, string>()
	for (const q of [first, second, community]) {
		options.set(q.id, (await makeOption(q.id, { label: "Yes" })).id)
	}
	return { game, first, second, community, options }
}

describe("Game.entry", () => {
	it("pairs each official question with the user's call, oldest first", async () => {
		const { game, first, second, community, options } = await seedGame()
		const user = await makeUser()
		const call = await makeCall(second.id, user.id)
		await makeSelection(call.id, options.get(second.id) ?? "")
		const communityCall = await makeCall(community.id, user.id)
		await makeSelection(communityCall.id, options.get(community.id) ?? "")

		const data = await expectData<EntryData>(ENTRY, {
			variables: { id: game.id, username: user.username },
		})

		const entry = data.game.entry
		expect(entry?.calledCount).toBe(1)
		expect(entry?.members.map((m) => m.question.id)).toEqual([
			first.id,
			second.id,
		])
		expect(entry?.members.map((m) => m.call?.id ?? null)).toEqual([
			null,
			call.id,
		])
	})

	it("is null when the user's only calls are on community questions, or there's no such user", async () => {
		const { game, community, options } = await seedGame()
		const user = await makeUser()
		const call = await makeCall(community.id, user.id)
		await makeSelection(call.id, options.get(community.id) ?? "")

		for (const username of [user.username, "nobody-by-this-name"]) {
			const data = await expectData<EntryData>(ENTRY, {
				variables: { id: game.id, username },
			})
			expect(data.game.entry).toBeNull()
		}
	})
})
