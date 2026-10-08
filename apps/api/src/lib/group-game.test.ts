import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { callSelections, questionOptions, type User } from "../db/schema"
import {
	makeCall,
	makeGame,
	makeGroup,
	makeQuestion,
	makeSelection,
	makeUser,
	makeYesNoOptions,
} from "../test/factories"
import { expectData } from "../test/graphql"

const BOARD = /* GraphQL */ `
	query Board($groupId: ID!, $gameId: ID!) {
		group(id: $groupId) {
			gameBoard(gameId: $gameId) {
				game { id }
				entries {
					user { id }
					calledCount
					wins
					losses
					points
					openCount
					openPayout { winLow winHigh lose }
				}
			}
		}
	}
`

type Payout = { winLow: number; winHigh: number; lose: number }
type BoardData = {
	group: {
		gameBoard: {
			game: { id: string }
			entries: {
				user: { id: string }
				calledCount: number
				wins: number
				losses: number
				points: number
				openCount: number
				openPayout: Payout | null
			}[]
		} | null
	} | null
}

const CALL_PAYOUT = /* GraphQL */ `
	query CallPayout($id: ID!) {
		call(id: $id) { payout { winLow winHigh lose } }
	}
`

const LIVE_GAMES = /* GraphQL */ `
	query LiveGames($groupId: ID!) {
		group(id: $groupId) {
			liveGames { game { id } callerCount }
		}
	}
`

type LiveGamesData = {
	group: { liveGames: { game: { id: string }; callerCount: number }[] }
}

const GAME_GROUPS = /* GraphQL */ `
	query GameGroups($id: ID!) {
		game(id: $id) {
			viewerGroupBoards { group { id } callerCount }
		}
	}
`

type GameGroupsData = {
	game: { viewerGroupBoards: { group: { id: string }; callerCount: number }[] }
}

const HOUR = 60 * 60 * 1000

async function gameQuestion(
	game: { id: string; leagueId: string; seasonId: string },
	status: "open" | "resolved" = "open",
) {
	const question = await makeQuestion({
		leagueId: game.leagueId,
		seasonId: game.seasonId,
		gameId: game.id,
		isOfficial: true,
		status,
	})
	const options = await makeYesNoOptions(question.id)
	return { question, ...options }
}

async function pick(questionId: string, optionId: string, user: User) {
	const call = await makeCall(questionId, user.id)
	const selection = await makeSelection(call.id, optionId, 50)
	return { call, selection }
}

async function settle(selectionId: string, resultPoints: number) {
	await db
		.update(callSelections)
		.set({ resultPoints })
		.where(eq(callSelections.id, selectionId))
}

describe("Group.gameBoard", () => {
	it("tallies each member's calls on the game, the viewer included", async () => {
		const viewer = await makeUser()
		const friend = await makeUser()
		const outsider = await makeUser()
		const group = await makeGroup({ admin: viewer, members: [friend] })
		const game = await makeGame({ status: "live" })

		const won = await gameQuestion(game, "resolved")
		await db
			.update(questionOptions)
			.set({ isCorrect: true })
			.where(eq(questionOptions.id, won.yes.id))
		const open = await gameQuestion(game)

		const viewerWin = await pick(won.question.id, won.yes.id, viewer)
		await settle(viewerWin.selection.id, 40)
		const friendLoss = await pick(won.question.id, won.no.id, friend)
		await settle(friendLoss.selection.id, -15)
		const viewerOpen = await pick(open.question.id, open.yes.id, viewer)
		await pick(open.question.id, open.yes.id, outsider)

		const data = await expectData<BoardData>(BOARD, {
			as: viewer,
			variables: { groupId: group.id, gameId: game.id },
		})
		const entries = data.group?.gameBoard?.entries ?? []
		expect(entries.map((e) => e.user.id)).toEqual([viewer.id, friend.id])

		const [mine, theirs] = entries
		expect(mine).toMatchObject({
			calledCount: 2,
			wins: 1,
			losses: 0,
			points: 40,
			openCount: 1,
		})
		expect(theirs).toMatchObject({
			calledCount: 1,
			wins: 0,
			losses: 1,
			points: -15,
			openCount: 0,
			openPayout: null,
		})

		const single = await expectData<{ call: { payout: Payout | null } }>(
			CALL_PAYOUT,
			{ as: viewer, variables: { id: viewerOpen.call.id } },
		)
		expect(single.call.payout).not.toBeNull()
		expect(mine?.openPayout).toEqual(single.call.payout)
	})

	it("sums the payouts of every open call", async () => {
		const viewer = await makeUser()
		const group = await makeGroup({ admin: viewer })
		const game = await makeGame({ status: "live" })
		const first = await gameQuestion(game)
		const second = await gameQuestion(game)
		const a = await pick(first.question.id, first.yes.id, viewer)
		const b = await pick(second.question.id, second.no.id, viewer)

		const payoutOf = async (id: string) =>
			(
				await expectData<{ call: { payout: Payout } }>(CALL_PAYOUT, {
					as: viewer,
					variables: { id },
				})
			).call.payout
		const [pa, pb] = await Promise.all([
			payoutOf(a.call.id),
			payoutOf(b.call.id),
		])

		const data = await expectData<BoardData>(BOARD, {
			as: viewer,
			variables: { groupId: group.id, gameId: game.id },
		})
		expect(data.group?.gameBoard?.entries[0]?.openPayout).toEqual({
			winLow: pa.winLow + pb.winLow,
			winHigh: pa.winHigh + pb.winHigh,
			lose: pa.lose + pb.lose,
		})
	})

	it("leaves unscored calls out of what's still open", async () => {
		const viewer = await makeUser()
		const group = await makeGroup({ admin: viewer })
		const game = await makeGame({ status: "live" })
		const { question, yes } = await gameQuestion(game)
		const call = await makeCall(question.id, viewer.id, {
			unscoredReason: "creator_sole_caller",
		})
		await makeSelection(call.id, yes.id)

		const data = await expectData<BoardData>(BOARD, {
			as: viewer,
			variables: { groupId: group.id, gameId: game.id },
		})
		expect(data.group?.gameBoard?.entries[0]).toMatchObject({
			calledCount: 1,
			openCount: 0,
			openPayout: null,
		})
	})

	it("hides the board from someone outside the group", async () => {
		const admin = await makeUser()
		const outsider = await makeUser()
		const group = await makeGroup({ admin })
		const game = await makeGame()

		const data = await expectData<BoardData>(BOARD, {
			as: outsider,
			variables: { groupId: group.id, gameId: game.id },
		})
		expect(data.group).toBeNull()
	})
})

describe("Group.gameBoard for a site admin", () => {
	it("opens the board of a group the admin isn't in", async () => {
		const member = await makeUser()
		const siteAdmin = await makeUser({ isAdmin: true })
		const group = await makeGroup({ admin: member })
		const game = await makeGame({ status: "live" })
		const { question, yes } = await gameQuestion(game)
		await pick(question.id, yes.id, member)

		const data = await expectData<BoardData>(BOARD, {
			as: siteAdmin,
			variables: { groupId: group.id, gameId: game.id },
		})
		expect(data.group?.gameBoard?.entries.map((e) => e.user.id)).toEqual([
			member.id,
		])
	})
})

describe("Group.liveGames", () => {
	it("lists called games that are live, upcoming within a day, or just final, live first", async () => {
		const viewer = await makeUser()
		const group = await makeGroup({ admin: viewer })
		const now = Date.now()
		const live = await makeGame({ status: "live", startsAt: new Date(now) })
		const soon = await makeGame({
			status: "scheduled",
			startsAt: new Date(now + 2 * HOUR),
		})
		const justFinal = await makeGame({
			status: "final",
			startsAt: new Date(now - 4 * HOUR),
			finalizedAt: new Date(now - HOUR),
		})
		const farOff = await makeGame({
			status: "scheduled",
			startsAt: new Date(now + 48 * HOUR),
		})
		const oldFinal = await makeGame({
			status: "final",
			startsAt: new Date(now - 30 * HOUR),
			finalizedAt: new Date(now - 26 * HOUR),
		})
		const uncalled = await makeGame({ status: "live" })
		await gameQuestion(uncalled)

		for (const game of [justFinal, soon, live, farOff, oldFinal]) {
			const { question, yes } = await gameQuestion(game)
			await pick(question.id, yes.id, viewer)
		}

		const data = await expectData<LiveGamesData>(LIVE_GAMES, {
			as: viewer,
			variables: { groupId: group.id },
		})
		expect(data.group.liveGames.map((g) => g.game.id)).toEqual([
			live.id,
			soon.id,
			justFinal.id,
		])
		expect(data.group.liveGames[0]?.callerCount).toBe(1)
	})

	it("only lists games in the group's tracked leagues", async () => {
		const viewer = await makeUser()
		const tracked = await makeGame({ status: "live" })
		const untracked = await makeGame({ status: "live" })
		const group = await makeGroup({
			admin: viewer,
			leagueIds: [tracked.leagueId],
		})
		for (const game of [tracked, untracked]) {
			const { question, yes } = await gameQuestion(game)
			await pick(question.id, yes.id, viewer)
		}

		const data = await expectData<LiveGamesData>(LIVE_GAMES, {
			as: viewer,
			variables: { groupId: group.id },
		})
		expect(data.group.liveGames.map((g) => g.game.id)).toEqual([tracked.id])
	})
})

describe("Game.viewerGroupBoards", () => {
	it("lists the viewer's groups where a member called the game", async () => {
		const viewer = await makeUser()
		const friend = await makeUser()
		const withCalls = await makeGroup({ admin: viewer, members: [friend] })
		await makeGroup({ admin: viewer })
		const notMine = await makeGroup({ admin: friend })
		const game = await makeGame({ status: "live" })
		const { question, yes } = await gameQuestion(game)
		await pick(question.id, yes.id, friend)

		const data = await expectData<GameGroupsData>(GAME_GROUPS, {
			as: viewer,
			variables: { id: game.id },
		})
		const ids = data.game.viewerGroupBoards.map((b) => b.group.id)
		expect(ids).toEqual([withCalls.id])
		expect(ids).not.toContain(notMine.id)
		expect(data.game.viewerGroupBoards[0]?.callerCount).toBe(1)
	})
})
