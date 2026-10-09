import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import {
	ballotQuestions,
	ballots,
	groupPins,
	questionShares,
	type User,
} from "../../../db/schema"
import {
	makeCall,
	makeGroup,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeUser,
} from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"
import { hoursAgo, hoursFromNow } from "../../../test/helpers"

// Admins pin up to GROUP_PINS_MAX callable questions and ballots; members see
// them in order with how many of the group has called each.

const PIN = /* GraphQL */ `
	mutation Pin($groupId: ID!, $questionId: ID!) {
		pinQuestionToGroup(groupId: $groupId, questionId: $questionId) {
			__typename
			... on ValidationError { fieldErrors { message } }
		}
	}
`

const UNPIN = /* GraphQL */ `
	mutation Unpin($groupId: ID!, $questionId: ID!) {
		unpinQuestionFromGroup(groupId: $groupId, questionId: $questionId) {
			__typename
		}
	}
`

const PIN_BALLOT = /* GraphQL */ `
	mutation PinBallot($groupId: ID!, $ballotId: ID!) {
		pinBallotToGroup(groupId: $groupId, ballotId: $ballotId) {
			__typename
			... on ValidationError { fieldErrors { message } }
		}
	}
`

const UNPIN_BALLOT = /* GraphQL */ `
	mutation UnpinBallot($groupId: ID!, $ballotId: ID!) {
		unpinBallotFromGroup(groupId: $groupId, ballotId: $ballotId) {
			__typename
		}
	}
`

const ORDER = /* GraphQL */ `
	mutation Order($groupId: ID!, $pinIds: [ID!]!) {
		setGroupPinOrder(groupId: $groupId, pinIds: $pinIds) {
			__typename
		}
	}
`

const PINNED = /* GraphQL */ `
	query Pinned($id: ID!) {
		group(id: $id) {
			pins {
				id
				memberCallCount
				memberFinishedCount
				pinnedBy { id }
				question { id }
				ballot { id }
			}
			pinnedQuestions { id }
		}
	}
`

const QUESTION_PINS = /* GraphQL */ `
	query QuestionPins($id: ID!) {
		question(id: $id) { viewerPinnedGroupIds }
	}
`

type PinResult = {
	__typename: string
	fieldErrors?: { message: string }[]
}

function pin(as: User, groupId: string, questionId: string) {
	return expectData<{ pinQuestionToGroup: PinResult }>(PIN, {
		as,
		variables: { groupId, questionId },
	}).then((data) => data.pinQuestionToGroup)
}

function pinBallot(as: User, groupId: string, ballotId: string) {
	return expectData<{ pinBallotToGroup: PinResult }>(PIN_BALLOT, {
		as,
		variables: { groupId, ballotId },
	}).then((data) => data.pinBallotToGroup)
}

type PinnedData = {
	group: {
		pins: {
			id: string
			memberCallCount: number
			memberFinishedCount: number | null
			question: { id: string } | null
			ballot: { id: string } | null
		}[]
		pinnedQuestions: { id: string }[]
	}
}

async function pinnedIds(groupId: string, as: User) {
	const data = await expectData<PinnedData>(PINNED, {
		as,
		variables: { id: groupId },
	})
	return data.group.pins
}

async function seed() {
	const [admin, member] = await Promise.all([makeUser(), makeUser()])
	const league = await makeLeague()
	const group = await makeGroup({
		admin,
		members: [member],
		leagueIds: [league.id],
	})
	const question = (overrides: Parameters<typeof makeQuestion>[0] = {}) =>
		makeQuestion({
			leagueId: league.id,
			locksAt: hoursFromNow(24),
			...overrides,
		})
	// A ballot of `count` questions in the group's league, each locked or
	// open as `locked` says.
	const ballot = async ({
		locked = [false],
		status = "published" as "published" | "draft",
	}: {
		locked?: boolean[]
		status?: "published" | "draft"
	} = {}) => {
		const season = await makeSeason({ leagueId: league.id })
		const [row] = await db
			.insert(ballots)
			.values({
				name: "Awards",
				slug: `awards-${season.id}`,
				sportId: league.sportId,
				leagueId: league.id,
				seasonId: season.id,
				status,
			})
			.returning()
		if (!row) throw new Error("ballot insert returned no row")
		const members = []
		for (const [index, isLocked] of locked.entries()) {
			const q = await question({
				seasonId: season.id,
				locksAt: isLocked ? hoursAgo(1) : hoursFromNow(24),
			})
			await db.insert(ballotQuestions).values({
				ballotId: row.id,
				questionId: q.id,
				label: `Slot ${index}`,
				sortOrder: index,
			})
			members.push(q)
		}
		return { ballot: row, members }
	}
	return { admin, member, league, group, question, ballot }
}

describe("pinQuestionToGroup", () => {
	it("appends the pin and shares the question once, telling the others", async () => {
		const { admin, member, group, question } = await seed()
		const q = await question()

		expect((await pin(admin, group.id, q.id)).__typename).toBe("GroupPayload")
		expect((await pin(admin, group.id, q.id)).__typename).toBe("GroupPayload")

		const pins = await db.query.groupPins.findMany({
			where: { groupId: group.id },
		})
		expect(pins).toMatchObject([{ questionId: q.id, pinnedBy: admin.id }])
		const shares = await db.query.questionShares.findMany({
			where: { groupId: group.id },
		})
		expect(shares).toHaveLength(1)
		const notices = await db.query.notifications.findMany({
			where: { userId: member.id, type: "question_shared_to_group" },
		})
		expect(notices).toHaveLength(1)
	})

	it("doesn't reshare a question already in the feed", async () => {
		const { admin, member, group, question } = await seed()
		const q = await question()
		await db
			.insert(questionShares)
			.values({ groupId: group.id, questionId: q.id, sharedBy: member.id })

		await pin(admin, group.id, q.id)

		const shares = await db.query.questionShares.findMany({
			where: { groupId: group.id },
		})
		expect(shares).toMatchObject([{ sharedBy: member.id }])
	})

	it("refuses members, other leagues, and locked questions", async () => {
		const { admin, member, group, question } = await seed()
		const open = await question()
		const otherLeague = await makeQuestion({ locksAt: hoursFromNow(24) })
		const pastLock = await question({ locksAt: hoursAgo(1) })

		expect((await pin(member, group.id, open.id)).__typename).toBe(
			"AuthorizationError",
		)
		expect((await pin(admin, group.id, otherLeague.id)).__typename).toBe(
			"ValidationError",
		)
		expect((await pin(admin, group.id, pastLock.id)).__typename).toBe(
			"ValidationError",
		)
	})

	it("caps callable pins at three, not counting locked ones", async () => {
		const { admin, group, question } = await seed()
		const stale = await question({ locksAt: hoursAgo(1) })
		await db
			.insert(groupPins)
			.values({ groupId: group.id, questionId: stale.id, position: 0 })
		for (let i = 0; i < 3; i++) {
			const q = await question()
			expect((await pin(admin, group.id, q.id)).__typename).toBe("GroupPayload")
		}

		const fourth = await question()
		const refused = await pin(admin, group.id, fourth.id)
		expect(refused).toMatchObject({
			__typename: "ValidationError",
			fieldErrors: [
				{
					message: "This group already has 3 pins. Unpin one first.",
				},
			],
		})
	})
})

describe("unpinQuestionFromGroup and setGroupPinOrder", () => {
	it("unpins", async () => {
		const { admin, group, question } = await seed()
		const q = await question()
		await pin(admin, group.id, q.id)

		await expectData(UNPIN, {
			as: admin,
			variables: { groupId: group.id, questionId: q.id },
		})
		expect(await pinnedIds(group.id, admin)).toEqual([])
	})

	it("reorders, keeping who pinned each", async () => {
		const { admin, group, question } = await seed()
		const a = await question()
		const b = await question()
		await pin(admin, group.id, a.id)
		await pin(admin, group.id, b.id)

		const data = await expectData<{ setGroupPinOrder: ErrorResult }>(ORDER, {
			as: admin,
			variables: { groupId: group.id, pinIds: [b.id, a.id] },
		})
		expect(data.setGroupPinOrder.__typename).toBe("GroupPayload")
		expect((await pinnedIds(group.id, admin)).map((p) => p.id)).toEqual([
			b.id,
			a.id,
		])
		const rows = await db.query.groupPins.findMany({
			where: { groupId: group.id },
		})
		expect(rows.every((row) => row.pinnedBy === admin.id)).toBe(true)
	})

	it("refuses a list that isn't the current pins", async () => {
		const { admin, group, question } = await seed()
		const a = await question()
		const b = await question()
		await pin(admin, group.id, a.id)

		const data = await expectData<{ setGroupPinOrder: ErrorResult }>(ORDER, {
			as: admin,
			variables: { groupId: group.id, pinIds: [a.id, b.id] },
		})
		expect(data.setGroupPinOrder.__typename).toBe("ValidationError")
	})
})

describe("pinBallotToGroup", () => {
	it("pins a ballot alongside questions, sharing their cap and order", async () => {
		const { admin, group, question, ballot } = await seed()
		const { ballot: b } = await ballot({ locked: [true, false] })
		const q = await question()

		expect((await pinBallot(admin, group.id, b.id)).__typename).toBe(
			"GroupPayload",
		)
		expect((await pinBallot(admin, group.id, b.id)).__typename).toBe(
			"GroupPayload",
		)
		await pin(admin, group.id, q.id)
		expect((await pinnedIds(group.id, admin)).map((p) => p.id)).toEqual([
			b.id,
			q.id,
		])

		await expectData(ORDER, {
			as: admin,
			variables: { groupId: group.id, pinIds: [q.id, b.id] },
		})
		expect((await pinnedIds(group.id, admin)).map((p) => p.id)).toEqual([
			q.id,
			b.id,
		])

		await pin(admin, group.id, (await question()).id)
		const { ballot: fourth } = await ballot()
		expect(await pinBallot(admin, group.id, fourth.id)).toMatchObject({
			__typename: "ValidationError",
			fieldErrors: [
				{ message: "This group already has 3 pins. Unpin one first." },
			],
		})
	})

	it("refuses members, other leagues, drafts, and fully locked ballots", async () => {
		const { admin, member, group, ballot } = await seed()
		const { ballot: open } = await ballot()
		const { ballot: draft } = await ballot({ status: "draft" })
		const { ballot: locked } = await ballot({ locked: [true, true] })
		const otherLeague = await makeLeague()
		const otherSeason = await makeSeason({ leagueId: otherLeague.id })
		const [elsewhere] = await db
			.insert(ballots)
			.values({
				name: "Elsewhere",
				slug: `elsewhere-${otherSeason.id}`,
				sportId: otherLeague.sportId,
				leagueId: otherLeague.id,
				seasonId: otherSeason.id,
				status: "published",
			})
			.returning()
		if (!elsewhere) throw new Error("ballot insert returned no row")
		const q = await makeQuestion({
			leagueId: otherLeague.id,
			seasonId: otherSeason.id,
			locksAt: hoursFromNow(24),
		})
		await db.insert(ballotQuestions).values({
			ballotId: elsewhere.id,
			questionId: q.id,
			label: "Slot",
		})

		expect((await pinBallot(member, group.id, open.id)).__typename).toBe(
			"AuthorizationError",
		)
		expect((await pinBallot(admin, group.id, draft.id)).__typename).toBe(
			"NotFoundError",
		)
		expect((await pinBallot(admin, group.id, locked.id)).__typename).toBe(
			"ValidationError",
		)
		expect((await pinBallot(admin, group.id, elsewhere.id)).__typename).toBe(
			"ValidationError",
		)
	})

	it("unpins", async () => {
		const { admin, group, ballot } = await seed()
		const { ballot: b } = await ballot()
		await pinBallot(admin, group.id, b.id)

		await expectData(UNPIN_BALLOT, {
			as: admin,
			variables: { groupId: group.id, ballotId: b.id },
		})
		expect(await pinnedIds(group.id, admin)).toEqual([])
	})
})

describe("Group.pins", () => {
	it("counts members who started and finished a pinned ballot", async () => {
		const { admin, member, group, ballot } = await seed()
		const { ballot: b, members } = await ballot({ locked: [false, false] })
		await pinBallot(admin, group.id, b.id)
		for (const q of members) await makeCall(q.id, member.id)
		await makeCall(members[0].id, admin.id)
		await makeCall(members[0].id, (await makeUser()).id)

		const data = await expectData<PinnedData>(PINNED, {
			as: admin,
			variables: { id: group.id },
		})
		expect(data.group.pins).toMatchObject([
			{
				id: b.id,
				question: null,
				ballot: { id: b.id },
				memberCallCount: 2,
				memberFinishedCount: 1,
			},
		])
		expect(data.group.pinnedQuestions).toEqual([])
	})

	it("hides a ballot once every member has locked", async () => {
		const { admin, group, ballot } = await seed()
		const { ballot: b } = await ballot({ locked: [true] })
		await db
			.insert(groupPins)
			.values({ groupId: group.id, ballotId: b.id, position: 0 })

		expect(await pinnedIds(group.id, admin)).toEqual([])
	})
})

describe("Group.pinnedQuestions", () => {
	it("hides locked pins and counts members' calls", async () => {
		const { admin, member, group, question } = await seed()
		const open = await question()
		const locked = await question({ locksAt: hoursAgo(1) })
		await db.insert(groupPins).values([
			{ groupId: group.id, questionId: locked.id, position: 0 },
			{ groupId: group.id, questionId: open.id, position: 1 },
		])
		await makeCall(open.id, member.id)
		await makeCall(open.id, (await makeUser()).id)

		expect(await pinnedIds(group.id, admin)).toMatchObject([
			{ id: open.id, memberCallCount: 1 },
		])
	})
})

describe("Question.viewerPinnedGroupIds", () => {
	it("lists only the viewer's own groups", async () => {
		const { admin, group, question } = await seed()
		const q = await question()
		await pin(admin, group.id, q.id)
		const outsider = await makeUser()

		const mine = await expectData<{
			question: { viewerPinnedGroupIds: string[] }
		}>(QUESTION_PINS, { as: admin, variables: { id: q.id } })
		const theirs = await expectData<{
			question: { viewerPinnedGroupIds: string[] }
		}>(QUESTION_PINS, { as: outsider, variables: { id: q.id } })
		expect(mine.question.viewerPinnedGroupIds).toEqual([group.id])
		expect(theirs.question.viewerPinnedGroupIds).toEqual([])
	})
})
