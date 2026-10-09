import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { ballotQuestions, ballots, type User } from "../../../db/schema"
import {
	makeCall,
	makeGroup,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeUser,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"
import { hoursAgo, hoursFromNow } from "../../../test/helpers"

// Admins add up to GROUP_BALLOTS_MAX ballots to the group's page, where they
// stay through lock and resolution until removed. Separate from pins.

const ADD = /* GraphQL */ `
	mutation Add($groupId: ID!, $ballotId: ID!) {
		addBallotToGroup(groupId: $groupId, ballotId: $ballotId) {
			__typename
			... on ValidationError { fieldErrors { message } }
		}
	}
`

const REMOVE = /* GraphQL */ `
	mutation Remove($groupId: ID!, $ballotId: ID!) {
		removeBallotFromGroup(groupId: $groupId, ballotId: $ballotId) {
			__typename
		}
	}
`

const LEGACY_PIN = /* GraphQL */ `
	mutation LegacyPin($groupId: ID!, $ballotId: ID!) {
		pinBallotToGroup(groupId: $groupId, ballotId: $ballotId) {
			__typename
		}
	}
`

const GROUP_BALLOTS = /* GraphQL */ `
	query GroupBallots($id: ID!) {
		group(id: $id) {
			ballots {
				id
				memberStartedCount
				memberFinishedCount
				addedBy { id }
			}
			pins { id }
		}
	}
`

type AddResult = {
	__typename: string
	fieldErrors?: { message: string }[]
}

type GroupBallotsData = {
	group: {
		ballots: {
			id: string
			memberStartedCount: number
			memberFinishedCount: number
			addedBy: { id: string } | null
		}[]
		pins: { id: string }[]
	}
}

function add(as: User, groupId: string, ballotId: string) {
	return expectData<{ addBallotToGroup: AddResult }>(ADD, {
		as,
		variables: { groupId, ballotId },
	}).then((data) => data.addBallotToGroup)
}

async function groupBallots(groupId: string, as: User) {
	const data = await expectData<GroupBallotsData>(GROUP_BALLOTS, {
		as,
		variables: { id: groupId },
	})
	return data.group
}

async function seed() {
	const [admin, member] = await Promise.all([makeUser(), makeUser()])
	const league = await makeLeague()
	const group = await makeGroup({
		admin,
		members: [member],
		leagueIds: [league.id],
	})
	// A ballot of `locked.length` questions in `leagueId`, each locked or
	// open as `locked` says.
	const ballot = async ({
		locked = [false],
		status = "published" as "published" | "draft",
		leagueId = league.id,
		sportId = league.sportId,
	}: {
		locked?: boolean[]
		status?: "published" | "draft"
		leagueId?: string
		sportId?: string
	} = {}) => {
		const season = await makeSeason({ leagueId })
		const [row] = await db
			.insert(ballots)
			.values({
				name: "Awards",
				slug: `awards-${season.id}`,
				sportId,
				leagueId,
				seasonId: season.id,
				status,
			})
			.returning()
		if (!row) throw new Error("ballot insert returned no row")
		const members = []
		for (const [index, isLocked] of locked.entries()) {
			const q = await makeQuestion({
				leagueId,
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
	return { admin, member, league, group, ballot }
}

describe("addBallotToGroup", () => {
	it("adds a ballot once, newest first, without taking a pin", async () => {
		const { admin, group, ballot } = await seed()
		const { ballot: first } = await ballot()
		const { ballot: second } = await ballot()

		expect((await add(admin, group.id, first.id)).__typename).toBe(
			"GroupPayload",
		)
		expect((await add(admin, group.id, first.id)).__typename).toBe(
			"GroupPayload",
		)
		await add(admin, group.id, second.id)

		const { ballots: listed, pins } = await groupBallots(group.id, admin)
		expect(listed.map((b) => b.id)).toEqual([second.id, first.id])
		expect(listed[0].addedBy).toEqual({ id: admin.id })
		expect(pins).toEqual([])
	})

	it("takes a ballot with everything locked, and keeps showing it", async () => {
		const { admin, group, ballot } = await seed()
		const { ballot: locked } = await ballot({ locked: [true, true] })

		expect((await add(admin, group.id, locked.id)).__typename).toBe(
			"GroupPayload",
		)
		expect(
			(await groupBallots(group.id, admin)).ballots.map((b) => b.id),
		).toEqual([locked.id])
	})

	it("refuses members, other leagues, and drafts", async () => {
		const { admin, member, group, ballot } = await seed()
		const { ballot: open } = await ballot()
		const { ballot: draft } = await ballot({ status: "draft" })
		const otherLeague = await makeLeague()
		const { ballot: elsewhere } = await ballot({
			leagueId: otherLeague.id,
			sportId: otherLeague.sportId,
		})

		expect((await add(member, group.id, open.id)).__typename).toBe(
			"AuthorizationError",
		)
		expect((await add(admin, group.id, draft.id)).__typename).toBe(
			"NotFoundError",
		)
		expect((await add(admin, group.id, elsewhere.id)).__typename).toBe(
			"ValidationError",
		)
	})

	it("caps published ballots at five", async () => {
		const { admin, group, ballot } = await seed()
		const added = []
		for (let i = 0; i < 5; i++) {
			const { ballot: b } = await ballot()
			expect((await add(admin, group.id, b.id)).__typename).toBe("GroupPayload")
			added.push(b)
		}

		const { ballot: sixth } = await ballot()
		expect(await add(admin, group.id, sixth.id)).toMatchObject({
			__typename: "ValidationError",
			fieldErrors: [
				{ message: "This group already has 5 ballots. Remove one first." },
			],
		})

		// An unpublished one stops counting.
		await db
			.update(ballots)
			.set({ status: "draft" })
			.where(eq(ballots.id, added[0].id))
		expect((await add(admin, group.id, sixth.id)).__typename).toBe(
			"GroupPayload",
		)
	})

	it("still answers to the deprecated pinBallotToGroup", async () => {
		const { admin, group, ballot } = await seed()
		const { ballot: b } = await ballot()

		await expectData(LEGACY_PIN, {
			as: admin,
			variables: { groupId: group.id, ballotId: b.id },
		})
		expect(
			(await groupBallots(group.id, admin)).ballots.map((x) => x.id),
		).toEqual([b.id])
	})
})

describe("removeBallotFromGroup", () => {
	it("removes", async () => {
		const { admin, group, ballot } = await seed()
		const { ballot: b } = await ballot()
		await add(admin, group.id, b.id)

		await expectData(REMOVE, {
			as: admin,
			variables: { groupId: group.id, ballotId: b.id },
		})
		expect((await groupBallots(group.id, admin)).ballots).toEqual([])
	})
})

describe("Group.ballots", () => {
	it("counts members who started and finished each ballot", async () => {
		const { admin, member, group, ballot } = await seed()
		const { ballot: b, members } = await ballot({ locked: [false, false] })
		await add(admin, group.id, b.id)
		for (const q of members) await makeCall(q.id, member.id)
		await makeCall(members[0].id, admin.id)
		await makeCall(members[0].id, (await makeUser()).id)

		expect((await groupBallots(group.id, member)).ballots).toMatchObject([
			{ id: b.id, memberStartedCount: 2, memberFinishedCount: 1 },
		])
	})

	it("hides an unpublished ballot", async () => {
		const { admin, group, ballot } = await seed()
		const { ballot: b } = await ballot()
		await add(admin, group.id, b.id)
		await db
			.update(ballots)
			.set({ status: "draft" })
			.where(eq(ballots.id, b.id))

		expect((await groupBallots(group.id, admin)).ballots).toEqual([])
	})
})
