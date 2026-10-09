import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import {
	ballotQuestions,
	ballots,
	callSelections,
	groupPins,
	questionOptions,
	questions,
	type User,
} from "../db/schema"
import {
	makeCall,
	makeGroup,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeSelection,
	makeUser,
	makeYesNoOptions,
} from "../test/factories"
import { expectData } from "../test/graphql"

const BOARD = /* GraphQL */ `
	query Board($groupId: ID!, $ballotId: ID!) {
		group(id: $groupId) {
			ballotBoard(ballotId: $ballotId) {
				ballot { id }
				entries {
					user { id }
					calledCount
					wins
					losses
					points
					completedAt
				}
				notStarted { id }
			}
		}
	}
`

type BoardData = {
	group: {
		ballotBoard: {
			ballot: { id: string }
			entries: {
				user: { id: string }
				calledCount: number
				wins: number
				losses: number
				points: number
				completedAt: string | null
			}[]
			notStarted: { id: string }[]
		} | null
	} | null
}

const HOUR = 60 * 60 * 1000

const BALLOT_GROUPS = /* GraphQL */ `
	query BallotGroups($ref: ID!) {
		ballot(id: $ref) {
			viewerGroupBoards {
				group { id }
				memberCount
				startedCount
				finishedCount
				viewerIsAdmin
				isPinned
			}
		}
	}
`

type BallotGroupsData = {
	ballot: {
		viewerGroupBoards: {
			group: { id: string }
			memberCount: number
			startedCount: number
			finishedCount: number
			viewerIsAdmin: boolean
			isPinned: boolean
		}[]
	}
}

// A ballot of `count` yes/no questions in one league.
async function seedBallot(
	count: number,
	{ status = "published" as "published" | "draft" } = {},
) {
	const league = await makeLeague()
	const season = await makeSeason({ leagueId: league.id })
	const [ballot] = await db
		.insert(ballots)
		.values({
			name: "Awards",
			slug: `awards-${league.slug}`,
			sportId: league.sportId,
			leagueId: league.id,
			seasonId: season.id,
			status,
			publishedAt: status === "published" ? new Date() : null,
		})
		.returning()
	if (!ballot) throw new Error("ballot insert returned no row")

	const members = []
	for (let index = 0; index < count; index++) {
		const question = await makeQuestion({
			leagueId: league.id,
			seasonId: season.id,
			isOfficial: true,
		})
		const options = await makeYesNoOptions(question.id)
		await db.insert(ballotQuestions).values({
			ballotId: ballot.id,
			questionId: question.id,
			label: `Slot ${index}`,
			sortOrder: index,
		})
		members.push({ question, ...options })
	}
	return { ballot, league, members }
}

async function pick(
	questionId: string,
	optionId: string,
	user: User,
	createdAt = new Date(),
) {
	const call = await makeCall(questionId, user.id, { createdAt })
	const selection = await makeSelection(call.id, optionId, 50)
	return { call, selection }
}

describe("Group.ballotBoard", () => {
	it("splits members into started and not started", async () => {
		const viewer = await makeUser({ name: "Viewer" })
		const friend = await makeUser({ name: "Friend" })
		const idle = await makeUser({ name: "Idle" })
		const outsider = await makeUser()
		const group = await makeGroup({ admin: viewer, members: [friend, idle] })
		const { ballot, members } = await seedBallot(3)

		const finishedAt = new Date(Date.now() - HOUR)
		for (const m of members) {
			await pick(m.question.id, m.yes.id, friend, finishedAt)
		}
		await pick(members[0].question.id, members[0].no.id, viewer)
		await pick(members[0].question.id, members[0].yes.id, outsider)

		const data = await expectData<BoardData>(BOARD, {
			as: viewer,
			variables: { groupId: group.id, ballotId: ballot.slug },
		})
		const board = data.group?.ballotBoard
		expect(board?.ballot.id).toBe(ballot.id)
		expect(board?.entries.map((e) => e.user.id)).toEqual([friend.id, viewer.id])
		expect(board?.entries[0]).toMatchObject({ calledCount: 3, wins: 0 })
		expect(board?.entries[0]?.completedAt).toBe(finishedAt.toISOString())
		expect(board?.entries[1]).toMatchObject({
			calledCount: 1,
			completedAt: null,
		})
		expect(board?.notStarted.map((u) => u.id)).toEqual([idle.id])
	})

	it("ranks by points once a pick settles", async () => {
		const viewer = await makeUser({ name: "Viewer" })
		const friend = await makeUser({ name: "Friend" })
		const group = await makeGroup({ admin: viewer, members: [friend] })
		const { ballot, members } = await seedBallot(2)
		const [first, second] = members

		// The friend finishes first, but the viewer's settled pick puts them
		// on top.
		await pick(first.question.id, first.no.id, friend)
		await pick(second.question.id, second.no.id, friend)
		const mine = await pick(first.question.id, first.yes.id, viewer)

		await db
			.update(questionOptions)
			.set({ isCorrect: true })
			.where(eq(questionOptions.id, first.yes.id))
		await db
			.update(callSelections)
			.set({ resultPoints: 30 })
			.where(eq(callSelections.id, mine.selection.id))
		await db
			.update(questions)
			.set({ status: "resolved" })
			.where(eq(questions.id, first.question.id))

		const data = await expectData<BoardData>(BOARD, {
			as: viewer,
			variables: { groupId: group.id, ballotId: ballot.id },
		})
		const entries = data.group?.ballotBoard?.entries ?? []
		expect(entries.map((e) => e.user.id)).toEqual([viewer.id, friend.id])
		expect(entries[0]).toMatchObject({ wins: 1, losses: 0, points: 30 })
		expect(entries[1]).toMatchObject({ wins: 0, losses: 1 })
	})

	it("is null for a draft ballot", async () => {
		const viewer = await makeUser()
		const group = await makeGroup({ admin: viewer })
		const { ballot } = await seedBallot(1, { status: "draft" })

		const data = await expectData<BoardData>(BOARD, {
			as: viewer,
			variables: { groupId: group.id, ballotId: ballot.id },
		})
		expect(data.group?.ballotBoard).toBeNull()
	})
})

describe("Ballot.viewerGroupBoards", () => {
	it("counts each group's progress, leaving out groups that don't follow the league", async () => {
		const viewer = await makeUser()
		const friend = await makeUser()
		const idle = await makeUser()
		const { ballot, league, members } = await seedBallot(2)
		const other = await makeLeague()

		const everyLeague = await makeGroup({
			admin: friend,
			members: [viewer, idle],
		})
		const tracksIt = await makeGroup({
			admin: viewer,
			leagueIds: [league.id],
		})
		await db
			.insert(groupPins)
			.values({ groupId: tracksIt.id, ballotId: ballot.id, position: 0 })
		await makeGroup({ admin: viewer, members: [friend], leagueIds: [other.id] })

		for (const m of members) await pick(m.question.id, m.yes.id, friend)
		await pick(members[0].question.id, members[0].yes.id, viewer)

		const data = await expectData<BallotGroupsData>(BALLOT_GROUPS, {
			as: viewer,
			variables: { ref: ballot.slug },
		})
		expect(data.ballot.viewerGroupBoards).toEqual([
			{
				group: { id: everyLeague.id },
				memberCount: 3,
				startedCount: 2,
				finishedCount: 1,
				viewerIsAdmin: false,
				isPinned: false,
			},
			{
				group: { id: tracksIt.id },
				memberCount: 1,
				startedCount: 1,
				finishedCount: 0,
				viewerIsAdmin: true,
				isPinned: true,
			},
		])
	})

	it("is empty when signed out", async () => {
		const { ballot } = await seedBallot(1)
		const data = await expectData<BallotGroupsData>(BALLOT_GROUPS, {
			variables: { ref: ballot.slug },
		})
		expect(data.ballot.viewerGroupBoards).toEqual([])
	})
})
