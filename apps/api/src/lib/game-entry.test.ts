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
import { GAME_ENTRY_VERDICT_MIN_CALLS, gameEntryVerdict } from "./game-entry"

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

	it("lists the community questions the user called apart from the official slate", async () => {
		const { game, first, second, community, options } = await seedGame()
		const user = await makeUser()
		const call = await makeCall(community.id, user.id)
		await makeSelection(call.id, options.get(community.id) ?? "")
		// Someone else's community question, which this user never called.
		await makeQuestion({
			leagueId: game.leagueId,
			seasonId: game.seasonId,
			gameId: game.id,
			isOfficial: false,
		})

		const data = await expectData<{
			game: {
				entry: {
					calledCount: number
					members: { question: { id: string }; call: { id: string } | null }[]
					communityMembers: {
						question: { id: string }
						call: { id: string } | null
					}[]
					official: { calledCount: number }
					community: { calledCount: number }
				} | null
			}
		}>(
			/* GraphQL */ `
				query CommunityEntry($id: ID!, $username: String!) {
					game(id: $id) {
						entry(username: $username) {
							calledCount
							members { question { id } call { id } }
							communityMembers { question { id } call { id } }
							official { calledCount }
							community { calledCount }
						}
					}
				}
			`,
			{ variables: { id: game.id, username: user.username } },
		)

		const entry = data.game.entry
		expect(entry?.calledCount).toBe(0)
		expect(entry?.members.map((m) => [m.question.id, m.call])).toEqual([
			[first.id, null],
			[second.id, null],
		])
		expect(
			entry?.communityMembers.map((m) => [m.question.id, m.call?.id]),
		).toEqual([[community.id, call.id]])
		expect(entry?.official.calledCount).toBe(0)
		expect(entry?.community.calledCount).toBe(1)
	})

	it("is null when the user has no calls on the game, or there's no such user", async () => {
		const { game } = await seedGame()
		const user = await makeUser()

		for (const username of [user.username, "nobody-by-this-name"]) {
			const data = await expectData<EntryData>(ENTRY, {
				variables: { id: game.id, username },
			})
			expect(data.game.entry).toBeNull()
		}
	})
})

describe("gameEntryVerdict", () => {
	const settled = (count: number) =>
		Array.from({ length: count }, () => ({
			member: { status: "resolved" as const },
			call: { unscoredReason: null },
		}))

	it("stamps a final game called all right or all wrong", () => {
		const members = settled(GAME_ENTRY_VERDICT_MIN_CALLS)
		expect(gameEntryVerdict({ members, wins: 5, losses: 0 }, "final")).toBe(
			"perfect",
		)
		expect(gameEntryVerdict({ members, wins: 0, losses: 5 }, "final")).toBe(
			"oh_fer",
		)
		expect(
			gameEntryVerdict({ members, wins: 4, losses: 1 }, "final"),
		).toBeNull()
	})

	it("needs the minimum number of settled calls", () => {
		const members = settled(GAME_ENTRY_VERDICT_MIN_CALLS - 1)
		expect(
			gameEntryVerdict({ members, wins: 0, losses: 4 }, "final"),
		).toBeNull()
	})

	it("waits for the game to finish", () => {
		const members = settled(GAME_ENTRY_VERDICT_MIN_CALLS)
		expect(gameEntryVerdict({ members, wins: 0, losses: 5 }, "live")).toBeNull()
	})

	it("waits on a counted call still missing its result", () => {
		const members = [
			...settled(GAME_ENTRY_VERDICT_MIN_CALLS),
			{ member: { status: "locked" as const }, call: { unscoredReason: null } },
		]
		expect(
			gameEntryVerdict({ members, wins: 0, losses: 5 }, "final"),
		).toBeNull()
	})

	it("ignores uncalled, voided and unscored questions", () => {
		const members = [
			...settled(GAME_ENTRY_VERDICT_MIN_CALLS),
			{ member: { status: "open" as const }, call: null },
			{ member: { status: "voided" as const }, call: { unscoredReason: null } },
			{
				member: { status: "locked" as const },
				call: { unscoredReason: "creator_sole_caller" as const },
			},
		]
		expect(gameEntryVerdict({ members, wins: 0, losses: 5 }, "final")).toBe(
			"oh_fer",
		)
	})
})

describe("Game.entry verdict", () => {
	it("reads OH_FER once a final game's calls all missed", async () => {
		const game = await makeGame({ status: "final" })
		const user = await makeUser()
		for (let i = 0; i < GAME_ENTRY_VERDICT_MIN_CALLS; i++) {
			const question = await makeQuestion({
				leagueId: game.leagueId,
				seasonId: game.seasonId,
				gameId: game.id,
				isOfficial: true,
				status: "resolved",
			})
			const wrong = await makeOption(question.id, { isCorrect: false })
			await makeOption(question.id, { isCorrect: true })
			const call = await makeCall(question.id, user.id)
			await makeSelection(call.id, wrong.id)
		}

		const data = await expectData<{
			game: { entry: { wins: number; losses: number; verdict: string | null } }
		}>(
			/* GraphQL */ `
				query Verdict($id: ID!, $username: String!) {
					game(id: $id) {
						entry(username: $username) { wins losses verdict }
					}
				}
			`,
			{ variables: { id: game.id, username: user.username } },
		)

		expect(data.game.entry).toEqual({ wins: 0, losses: 5, verdict: "OH_FER" })
	})

	it("counts a community call in the record but not the verdict", async () => {
		const game = await makeGame({ status: "final" })
		const user = await makeUser()
		const scope = {
			leagueId: game.leagueId,
			seasonId: game.seasonId,
			gameId: game.id,
			status: "resolved" as const,
		}
		for (let i = 0; i < GAME_ENTRY_VERDICT_MIN_CALLS; i++) {
			const question = await makeQuestion({ ...scope, isOfficial: true })
			const right = await makeOption(question.id, { isCorrect: true })
			await makeOption(question.id, { isCorrect: false })
			const call = await makeCall(question.id, user.id)
			await makeSelection(call.id, right.id)
		}
		const community = await makeQuestion({ ...scope, isOfficial: false })
		const wrong = await makeOption(community.id, { isCorrect: false })
		await makeOption(community.id, { isCorrect: true })
		const miss = await makeCall(community.id, user.id)
		await makeSelection(miss.id, wrong.id)

		const data = await expectData<{
			game: {
				entry: {
					wins: number
					losses: number
					verdict: string | null
					official: { wins: number; losses: number }
					community: { wins: number; losses: number }
				}
			}
		}>(
			/* GraphQL */ `
				query SplitVerdict($id: ID!, $username: String!) {
					game(id: $id) {
						entry(username: $username) {
							wins
							losses
							verdict
							official { wins losses }
							community { wins losses }
						}
					}
				}
			`,
			{ variables: { id: game.id, username: user.username } },
		)

		expect(data.game.entry).toEqual({
			wins: 5,
			losses: 1,
			verdict: "PERFECT",
			official: { wins: 5, losses: 0 },
			community: { wins: 0, losses: 1 },
		})
	})
})
