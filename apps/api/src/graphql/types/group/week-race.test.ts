import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { callSelections, type User } from "../../../db/schema"
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

const HOUR = 60 * 60 * 1000

const RACE = /* GraphQL */ `
	query Race($groupId: ID!) {
		group(id: $groupId) {
			weekRace {
				endsAt
				qualifyingCalls
				leaders { rank totalPoints settledCallCount openCallCount user { username } }
				viewer { rank totalPoints user { username } }
				viewerNeighbor { rank user { username } }
				nextGame { id }
			}
		}
	}
`

type Entry = {
	rank: number | null
	totalPoints: number
	settledCallCount: number
	openCallCount: number
	user: { username: string }
}

type RaceData = {
	group: {
		weekRace: {
			endsAt: string
			qualifyingCalls: number
			leaders: Entry[]
			viewer: Pick<Entry, "rank" | "totalPoints" | "user"> | null
			viewerNeighbor: Pick<Entry, "rank" | "user"> | null
			nextGame: { id: string } | null
		}
	}
}

async function setup(memberCount: number) {
	const league = await makeLeague()
	const season = await makeSeason({ leagueId: league.id })
	const admin = await makeUser()
	const members: User[] = []
	for (let i = 0; i < memberCount; i++) members.push(await makeUser())
	const group = await makeGroup({ admin, members, leagueIds: [league.id] })
	return { league, season, admin, members, group }
}

type Ctx = Awaited<ReturnType<typeof setup>>

// A game that went final this week with each pick already scored.
async function settled(ctx: Ctx, picks: { user: User; points: number }[]) {
	const week = weekContaining(new Date())
	const startsAt = new Date(week.start.getTime() + HOUR)
	const game = await makeGame({
		leagueId: ctx.league.id,
		seasonId: ctx.season.id,
		startsAt,
		status: "final",
		finalizedAt: new Date(startsAt.getTime() + 3 * HOUR),
	})
	const question = await makeQuestion({
		leagueId: ctx.league.id,
		seasonId: ctx.season.id,
		gameId: game.id,
		locksAt: startsAt,
		status: "resolved",
		resolvedAt: new Date(startsAt.getTime() + 4 * HOUR),
	})
	const yes = await makeOption(question.id, { label: "Yes", isCorrect: true })
	for (const pick of picks) {
		const call = await makeCall(question.id, pick.user.id, {
			createdAt: new Date(startsAt.getTime() - HOUR),
		})
		await db.insert(callSelections).values({
			callId: call.id,
			optionId: yes.id,
			conviction: 80,
			resultPoints: pick.points,
		})
	}
}

// An unsettled question on a game starting at `startsAt`.
async function pending(ctx: Ctx, startsAt: Date, users: User[]) {
	const game = await makeGame({
		leagueId: ctx.league.id,
		seasonId: ctx.season.id,
		startsAt,
	})
	const question = await makeQuestion({
		leagueId: ctx.league.id,
		seasonId: ctx.season.id,
		gameId: game.id,
		locksAt: startsAt,
	})
	for (const user of users) await makeCall(question.id, user.id)
	return game
}

describe("Group.weekRace", () => {
	it("ranks the top three and counts the calls still riding on the week", async () => {
		const ctx = await setup(3)
		const [a, b, c] = ctx.members as [User, User, User]
		for (let i = 0; i < 3; i++) {
			await settled(ctx, [
				{ user: a, points: 30 },
				{ user: b, points: 20 },
				{ user: c, points: 10 },
				{ user: ctx.admin, points: 5 },
			])
		}
		const week = weekContaining(new Date())
		const thisWeek = await pending(ctx, new Date(week.end.getTime() - HOUR), [
			a,
			b,
		])
		await pending(ctx, new Date(week.end.getTime() + 24 * HOUR), [a])
		// A season-long question lands whenever it resolves, so it never counts.
		const seasonLong = await makeQuestion({
			leagueId: ctx.league.id,
			seasonId: ctx.season.id,
		})
		await makeCall(seasonLong.id, a.id)

		const data = await expectData<RaceData>(RACE, {
			as: ctx.admin,
			variables: { groupId: ctx.group.id },
		})
		const race = data.group.weekRace

		expect(race.qualifyingCalls).toBe(3)
		expect(new Date(race.endsAt).getTime()).toBe(week.end.getTime())
		expect(race.leaders).toEqual([
			{
				rank: 1,
				totalPoints: 90,
				settledCallCount: 3,
				openCallCount: 1,
				user: { username: a.username },
			},
			{
				rank: 2,
				totalPoints: 60,
				settledCallCount: 3,
				openCallCount: 1,
				user: { username: b.username },
			},
			{
				rank: 3,
				totalPoints: 30,
				settledCallCount: 3,
				openCallCount: 0,
				user: { username: c.username },
			},
		])
		expect(race.nextGame).toEqual({ id: thisWeek.id })
	})

	it("gives a viewer outside the top three their row and the member above", async () => {
		const ctx = await setup(3)
		const [a, b, c] = ctx.members as [User, User, User]
		await settled(ctx, [
			{ user: a, points: 30 },
			{ user: b, points: 20 },
			{ user: c, points: 10 },
			{ user: ctx.admin, points: 5 },
		])

		const data = await expectData<RaceData>(RACE, {
			as: ctx.admin,
			variables: { groupId: ctx.group.id },
		})
		const race = data.group.weekRace

		expect(race.viewer).toEqual({
			rank: 4,
			totalPoints: 5,
			user: { username: ctx.admin.username },
		})
		expect(race.viewerNeighbor).toEqual({
			rank: 3,
			user: { username: c.username },
		})
		expect(race.nextGame).toBeNull()
	})

	it("pairs the leader with second place", async () => {
		const ctx = await setup(1)
		const [member] = ctx.members as [User]
		await settled(ctx, [
			{ user: ctx.admin, points: 30 },
			{ user: member, points: 20 },
		])

		const data = await expectData<RaceData>(RACE, {
			as: ctx.admin,
			variables: { groupId: ctx.group.id },
		})

		expect(data.group.weekRace.viewer?.rank).toBe(1)
		expect(data.group.weekRace.viewerNeighbor).toEqual({
			rank: 2,
			user: { username: member.username },
		})
	})
})
