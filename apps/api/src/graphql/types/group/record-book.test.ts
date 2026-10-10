import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import {
	callSelections,
	groupMembers,
	pointAwards,
	type User,
} from "../../../db/schema"
import {
	buildGroupWeekLeaderboard,
	loadReigningPlayersOfTheWeek,
} from "../../../lib/group-recap/board"
import { ensureGroupRecap } from "../../../lib/group-recap/generate"
import { weekContaining } from "../../../lib/group-recap/week"
import {
	makeCall,
	makeGame,
	makeGroup,
	makeLeague,
	makeOption,
	makeQuestion,
	makeSeason,
	makeUser,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"

// Player of the Week on a recap, and the Record Book the group's recaps add
// up to.

const WEEK = weekContaining(new Date("2026-10-08T12:00:00Z"))
const GAME_START = new Date("2026-10-10T17:00:00Z")

async function setup() {
	const league = await makeLeague()
	const season = await makeSeason({ leagueId: league.id })
	const admin = await makeUser()
	const member = await makeUser()
	const group = await makeGroup({
		admin,
		members: [member],
		leagueIds: [league.id],
	})
	return { league, season, admin, member, group }
}

// A yes/no question on a game that went final inside WEEK, each pick already
// scored. Returns the game, for an award to be dated by.
async function settledQuestion(
	ctx: Awaited<ReturnType<typeof setup>>,
	picks: { user: User; yes: boolean; points: number }[],
) {
	const game = await makeGame({
		leagueId: ctx.league.id,
		seasonId: ctx.season.id,
		startsAt: GAME_START,
		status: "final",
		finalizedAt: new Date(GAME_START.getTime() + 3 * 60 * 60 * 1000),
	})
	const question = await makeQuestion({
		leagueId: ctx.league.id,
		seasonId: ctx.season.id,
		gameId: game.id,
		locksAt: GAME_START,
		status: "resolved",
		resolvedAt: new Date(GAME_START.getTime() + 4 * 60 * 60 * 1000),
	})
	const yes = await makeOption(question.id, { label: "Yes", isCorrect: true })
	const no = await makeOption(question.id, { label: "No", isCorrect: false })
	for (const pick of picks) {
		const call = await makeCall(question.id, pick.user.id, {
			createdAt: new Date(GAME_START.getTime() - 60 * 60 * 1000),
		})
		await db.insert(callSelections).values({
			callId: call.id,
			optionId: pick.yes ? yes.id : no.id,
			conviction: 80,
			resultPoints: pick.points,
		})
	}
	return game
}

// Three questions both members called right for 10 apiece, so the week is
// tied until something else breaks it.
async function evenWeek(ctx: Awaited<ReturnType<typeof setup>>) {
	const games = []
	for (let i = 0; i < 3; i++) {
		games.push(
			await settledQuestion(ctx, [
				{ user: ctx.admin, yes: true, points: 10 },
				{ user: ctx.member, yes: true, points: 10 },
			]),
		)
	}
	return games
}

const RECAP = /* GraphQL */ `
	query Recap($token: String!) {
		groupRecap(token: $token) {
			playersOfTheWeek { points wins losses user { username } }
		}
	}
`

type RecapResult = {
	groupRecap: {
		playersOfTheWeek: {
			points: number
			wins: number
			losses: number
			user: { username: string }
		}[]
	} | null
}

const RECORD_BOOK = /* GraphQL */ `
	query RecordBook($groupId: ID!) {
		group(id: $groupId) {
			recordBook {
				weeks {
					weekKey
					weekLabel
					recapped
					shareToken
					playersOfTheWeek { points user { username } }
				}
				mostPlayerOfTheWeekAwards { count user { username } }
				mostPointsOnACall { points headline leagueAbbr user { username } }
				mostSweeps { count }
			}
		}
	}
`

type RecordBookResult = {
	group: {
		recordBook: {
			weeks: {
				weekKey: string
				weekLabel: string
				recapped: boolean
				shareToken: string | null
				playersOfTheWeek: {
					points: number
					user: { username: string } | null
				}[]
			}[]
			mostPlayerOfTheWeekAwards: {
				count: number
				user: { username: string }
			}[]
			mostPointsOnACall: {
				points: number
				headline: string
				leagueAbbr: string
				user: { username: string }
			}[]
			mostSweeps: { count: number }[]
		}
	}
}

describe("Player of the Week", () => {
	it("counts a bonus dated inside the week", async () => {
		const ctx = await setup()
		const [game] = await evenWeek(ctx)
		if (!game) throw new Error("no game")
		await db.insert(pointAwards).values({
			userId: ctx.member.id,
			leagueId: ctx.league.id,
			seasonId: ctx.season.id,
			kind: "streak_milestone",
			scopeKey: "scope",
			sourceKey: "source",
			points: 6,
			gameId: game.id,
		})
		const recap = await ensureGroupRecap(ctx.group.id, WEEK)

		const data = await expectData<RecapResult>(RECAP, {
			as: ctx.admin,
			variables: { token: recap?.shareToken },
		})
		expect(data.groupRecap?.playersOfTheWeek).toEqual([
			{
				points: 36,
				wins: 3,
				losses: 0,
				user: { username: ctx.member.username },
			},
		])
	})

	it("names nobody once the winner hides from recaps", async () => {
		const ctx = await setup()
		await evenWeek(ctx)
		await settledQuestion(ctx, [
			{ user: ctx.member, yes: true, points: 20 },
			{ user: ctx.admin, yes: false, points: -4 },
		])
		const made = await ensureGroupRecap(ctx.group.id, WEEK)
		await db
			.update(groupMembers)
			.set({ hiddenFromRecaps: true })
			.where(eq(groupMembers.userId, ctx.member.id))

		const recap = await expectData<RecapResult>(RECAP, {
			as: ctx.admin,
			variables: { token: made?.shareToken },
		})
		expect(recap.groupRecap?.playersOfTheWeek).toEqual([])

		const book = await expectData<RecordBookResult>(RECORD_BOOK, {
			as: ctx.admin,
			variables: { groupId: ctx.group.id },
		})
		expect(book.group.recordBook.weeks[0]?.playersOfTheWeek).toEqual([
			{ points: 50, user: null },
		])
		expect(book.group.recordBook.mostPlayerOfTheWeekAwards).toEqual([])
	})
})

describe("recordBook", () => {
	it("adds up the group's recaps", async () => {
		const ctx = await setup()
		await evenWeek(ctx)
		await settledQuestion(ctx, [{ user: ctx.admin, yes: true, points: 25 }])
		const recap = await ensureGroupRecap(ctx.group.id, WEEK)

		const data = await expectData<RecordBookResult>(RECORD_BOOK, {
			as: ctx.member,
			variables: { groupId: ctx.group.id },
		})
		const book = data.group.recordBook
		expect(book.weeks).toEqual([
			{
				weekKey: WEEK.key,
				weekLabel: "Oct 6 to 12",
				recapped: true,
				shareToken: recap?.shareToken,
				playersOfTheWeek: [
					{ points: 55, user: { username: ctx.admin.username } },
				],
			},
		])
		expect(book.mostPlayerOfTheWeekAwards).toEqual([
			{ count: 1, user: { username: ctx.admin.username } },
		])
		expect(book.mostPointsOnACall[0]).toMatchObject({
			points: 25,
			leagueAbbr: ctx.league.abbreviation.toUpperCase(),
			user: { username: ctx.admin.username },
		})
		expect(book.mostPointsOnACall[0]?.headline).toContain(" @ ")
		expect(book.mostSweeps).toEqual([])
	})
})

describe("the week on the leaderboard", () => {
	it("ranks the week the way Player of the Week is decided", async () => {
		const ctx = await setup()
		const [game] = await evenWeek(ctx)
		if (!game) throw new Error("no game")
		await settledQuestion(ctx, [{ user: ctx.admin, yes: false, points: -7 }])
		await db.insert(pointAwards).values({
			userId: ctx.member.id,
			leagueId: ctx.league.id,
			seasonId: ctx.season.id,
			kind: "sweep",
			scopeKey: "scope",
			sourceKey: "source",
			points: 4,
			gameId: game.id,
		})

		const board = await buildGroupWeekLeaderboard(
			ctx.group.id,
			[ctx.league.id],
			WEEK,
		)
		expect(
			board.map((e) => [
				e.user.id,
				e.rank,
				e.totalPoints,
				e.resolvedCallCount,
				e.accuracy,
			]),
		).toEqual([
			[ctx.member.id, 1, 34, 3, 100],
			[ctx.admin.id, 2, 23, 4, 75],
		])
	})

	it("crowns the newest recap's winner", async () => {
		const ctx = await setup()
		expect(await loadReigningPlayersOfTheWeek(ctx.group.id)).toBeNull()

		await evenWeek(ctx)
		await settledQuestion(ctx, [{ user: ctx.admin, yes: true, points: 25 }])
		await ensureGroupRecap(ctx.group.id, WEEK)
		const reigning = await loadReigningPlayersOfTheWeek(ctx.group.id)
		expect(reigning?.week.key).toBe(WEEK.key)
		expect(reigning?.users.map((u) => u.id)).toEqual([ctx.admin.id])

		await db
			.update(groupMembers)
			.set({ hiddenFromRecaps: true })
			.where(eq(groupMembers.userId, ctx.admin.id))
		expect(await loadReigningPlayersOfTheWeek(ctx.group.id)).toBeNull()
	})
})
