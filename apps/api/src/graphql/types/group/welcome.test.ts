import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import {
	type Group,
	groupMembers,
	groupPins,
	questionShares,
	type User,
} from "../../../db/schema"
import { insertGroupInvite } from "../../../lib/groups"
import {
	makeCall,
	makeGroup,
	makeLeague,
	makeQuestion,
	makeUser,
	makeYesNoOptions,
} from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"
import { hoursAgo, hoursFromNow } from "../../../test/helpers"

// The welcome modal: who sees it, what it offers a new member to call, and
// what joining and calling from it record.

const JOIN = /* GraphQL */ `
	mutation Join($code: String!) {
		joinGroupByCode(input: { code: $code }) {
			__typename
		}
	}
`

const CREATE_GROUP = /* GraphQL */ `
	mutation CreateGroup($input: CreateGroupInput!) {
		createGroup(input: $input) {
			... on GroupPayload { group { viewerDismissedWelcome } }
		}
	}
`

const DISMISSED = /* GraphQL */ `
	query Dismissed($id: ID!) {
		group(id: $id) { viewerDismissedWelcome }
	}
`

const DISMISS = /* GraphQL */ `
	mutation Dismiss($groupId: ID!) {
		dismissGroupWelcome(groupId: $groupId) {
			__typename
			... on Group { viewerDismissedWelcome }
		}
	}
`

const WELCOME = /* GraphQL */ `
	query Welcome($id: ID!) {
		group(id: $id) {
			welcome {
				source
				memberCallCount
				otherPinnedCount
				inviter { id }
				question { id }
				inviterCall { id }
			}
		}
	}
`

const UPDATE_WELCOME = /* GraphQL */ `
	mutation UpdateWelcome($input: UpdateGroupWelcomeInput!) {
		updateGroupWelcome(input: $input) {
			__typename
			... on GroupPayload { group { welcomeMessage } }
		}
	}
`

const CAST_CALL = /* GraphQL */ `
	mutation CastCall($input: CastCallInput!) {
		castCall(input: $input) {
			__typename
			... on CastCallPayload { call { id } }
		}
	}
`

type Welcome = {
	source: "PINNED" | "SUGGESTED" | null
	memberCallCount: number
	otherPinnedCount: number
	inviter: { id: string } | null
	question: { id: string } | null
	inviterCall: { id: string } | null
}

async function welcomeFor(groupId: string, as: User) {
	const data = await expectData<{ group: { welcome: Welcome } }>(WELCOME, {
		as,
		variables: { id: groupId },
	})
	return data.group.welcome
}

async function pin(group: Group, questionId: string, position: number) {
	await db.insert(groupPins).values({ groupId: group.id, questionId, position })
}

// A group tracking one fresh league, with a joiner who came in on the
// admin's link.
async function seedGroup() {
	const [admin, joiner] = await Promise.all([makeUser(), makeUser()])
	const league = await makeLeague()
	const group = await makeGroup({ admin, leagueIds: [league.id] })
	await db
		.insert(groupMembers)
		.values({ groupId: group.id, userId: joiner.id, invitedById: admin.id })
	const question = (overrides: Parameters<typeof makeQuestion>[0] = {}) =>
		makeQuestion({
			leagueId: league.id,
			locksAt: hoursFromNow(24),
			...overrides,
		})
	return { admin, joiner, league, group, question }
}

describe("joining a group", () => {
	it("records the inviter and one join event, and leaves the welcome unseen", async () => {
		const [admin, joiner] = await Promise.all([makeUser(), makeUser()])
		const group = await makeGroup({ admin })
		const invite = await insertGroupInvite(group.id, admin.id, null)

		for (let i = 0; i < 2; i++) {
			await expectData(JOIN, { as: joiner, variables: { code: invite.code } })
		}

		const member = await db.query.groupMembers.findFirst({
			where: { groupId: group.id, userId: joiner.id },
		})
		expect(member?.invitedById).toBe(admin.id)
		const events = await db.query.groupEvents.findMany({
			where: { groupId: group.id },
		})
		expect(events).toMatchObject([
			{ kind: "member_joined", actorId: joiner.id, invitedById: admin.id },
		])
		const data = await expectData<{
			group: { viewerDismissedWelcome: boolean }
		}>(DISMISSED, { as: joiner, variables: { id: group.id } })
		expect(data.group.viewerDismissedWelcome).toBe(false)
	})

	it("never shows the creator a welcome", async () => {
		const user = await makeUser()
		const data = await expectData<{
			createGroup: { group: { viewerDismissedWelcome: boolean } }
		}>(CREATE_GROUP, {
			as: user,
			variables: { input: { name: "Celtics Talk" } },
		})
		expect(data.createGroup.group.viewerDismissedWelcome).toBe(true)
	})
})

describe("dismissGroupWelcome", () => {
	it("marks it seen for the caller only", async () => {
		const { group, joiner } = await seedGroup()
		const other = await makeUser()
		await db
			.insert(groupMembers)
			.values({ groupId: group.id, userId: other.id })

		const data = await expectData<{
			dismissGroupWelcome: { viewerDismissedWelcome: boolean }
		}>(DISMISS, { as: joiner, variables: { groupId: group.id } })
		expect(data.dismissGroupWelcome.viewerDismissedWelcome).toBe(true)

		const theirs = await expectData<{
			group: { viewerDismissedWelcome: boolean }
		}>(DISMISSED, { as: other, variables: { id: group.id } })
		expect(theirs.group.viewerDismissedWelcome).toBe(false)
	})

	it("refuses someone outside the group", async () => {
		const { group } = await seedGroup()
		const outsider = await makeUser()
		const data = await expectData<{ dismissGroupWelcome: ErrorResult }>(
			DISMISS,
			{ as: outsider, variables: { groupId: group.id } },
		)
		expect(data.dismissGroupWelcome.__typename).toBe("AuthorizationError")
	})
})

describe("Group.welcome", () => {
	it("offers the first pin the viewer can still call, in the admins' order", async () => {
		const { group, joiner, question } = await seedGroup()
		const called = await question()
		const lockingSoon = await question({ locksAt: hoursFromNow(0.25) })
		const first = await question()
		const second = await question()
		const otherLeague = await makeQuestion({ locksAt: hoursFromNow(24) })
		await makeCall(called.id, joiner.id)
		await pin(group, called.id, 0)
		await pin(group, lockingSoon.id, 1)
		await pin(group, otherLeague.id, 2)
		await pin(group, second.id, 4)
		await pin(group, first.id, 3)

		const welcome = await welcomeFor(group.id, joiner)
		expect(welcome).toMatchObject({
			source: "PINNED",
			question: { id: first.id },
			otherPinnedCount: 1,
		})
	})

	it("suggests a shared question first, then the most called by members, then the soonest to lock", async () => {
		const { group, admin, joiner, question } = await seedGroup()
		const member = await makeUser()
		await db
			.insert(groupMembers)
			.values({ groupId: group.id, userId: member.id })
		const outsider = await makeUser()

		const soonest = await question({ locksAt: hoursFromNow(2) })
		const later = await question({ locksAt: hoursFromNow(48) })
		expect((await welcomeFor(group.id, joiner)).question?.id).toBe(soonest.id)

		// Calls from outside the group don't count toward the ranking.
		const popular = await question({ locksAt: hoursFromNow(72) })
		await makeCall(popular.id, member.id)
		await makeCall(popular.id, admin.id)
		await makeCall(later.id, outsider.id)
		await makeCall(later.id, member.id)
		const ranked = await welcomeFor(group.id, joiner)
		expect(ranked).toMatchObject({
			source: "SUGGESTED",
			question: { id: popular.id },
			memberCallCount: 2,
			otherPinnedCount: 0,
		})

		const shared = await question({ locksAt: hoursFromNow(96) })
		await db
			.insert(questionShares)
			.values({ groupId: group.id, questionId: shared.id, sharedBy: admin.id })
		expect((await welcomeFor(group.id, joiner)).question?.id).toBe(shared.id)
	})

	it("skips questions the viewer called, closed ones, and other leagues", async () => {
		const { group, joiner, question } = await seedGroup()
		const called = await question()
		await makeCall(called.id, joiner.id)
		await question({ status: "locked" })
		await question({ locksAt: hoursAgo(1) })
		await makeQuestion({ locksAt: hoursFromNow(24) })

		const welcome = await welcomeFor(group.id, joiner)
		expect(welcome).toMatchObject({ question: null, source: null })
	})

	it("returns the inviter and their call on the offered question", async () => {
		const { group, admin, joiner, question } = await seedGroup()
		const q = await question()
		const call = await makeCall(q.id, admin.id)

		const welcome = await welcomeFor(group.id, joiner)
		expect(welcome).toMatchObject({
			inviter: { id: admin.id },
			question: { id: q.id },
			inviterCall: { id: call.id },
			memberCallCount: 1,
		})
	})
})

describe("castCall with welcomeGroupId", () => {
	async function cast(
		as: User,
		questionId: string,
		optionId: string,
		welcomeGroupId: string,
	) {
		return expectData<{
			castCall: { __typename: string; call?: { id: string } }
		}>(CAST_CALL, {
			as,
			variables: {
				input: {
					questionId,
					selections: [{ optionId, conviction: 60 }],
					welcomeGroupId,
				},
			},
		})
	}

	it("records the first welcome call on the membership and never overwrites it", async () => {
		const { group, joiner, question } = await seedGroup()
		const first = await question()
		const second = await question()
		const firstOptions = await makeYesNoOptions(first.id)
		const secondOptions = await makeYesNoOptions(second.id)

		const data = await cast(joiner, first.id, firstOptions.yes.id, group.id)
		await cast(joiner, second.id, secondOptions.yes.id, group.id)

		const member = await db.query.groupMembers.findFirst({
			where: { groupId: group.id, userId: joiner.id },
		})
		expect(member?.welcomeCallId).toBe(data.castCall.call?.id)
	})

	it("still casts the call for a non-member or a malformed id", async () => {
		const { group, question } = await seedGroup()
		const outsider = await makeUser()
		const a = await question()
		const b = await question()
		const aOptions = await makeYesNoOptions(a.id)
		const bOptions = await makeYesNoOptions(b.id)

		const notMember = await cast(outsider, a.id, aOptions.yes.id, group.id)
		const garbage = await cast(outsider, b.id, bOptions.yes.id, "not-a-uuid")
		expect(notMember.castCall.__typename).toBe("CastCallPayload")
		expect(garbage.castCall.__typename).toBe("CastCallPayload")
		const rows = await db.query.groupMembers.findMany({
			where: { userId: outsider.id },
		})
		expect(rows).toHaveLength(0)
	})
})

describe("updateGroupWelcome", () => {
	it("saves the message and clears it when blank", async () => {
		const { group, admin } = await seedGroup()
		const saved = await expectData<{
			updateGroupWelcome: { group: { welcomeMessage: string | null } }
		}>(UPDATE_WELCOME, {
			as: admin,
			variables: {
				input: { groupId: group.id, welcomeMessage: "  Loser buys wings.  " },
			},
		})
		expect(saved.updateGroupWelcome.group.welcomeMessage).toBe(
			"Loser buys wings.",
		)

		const cleared = await expectData<{
			updateGroupWelcome: { group: { welcomeMessage: string | null } }
		}>(UPDATE_WELCOME, {
			as: admin,
			variables: { input: { groupId: group.id, welcomeMessage: "   " } },
		})
		expect(cleared.updateGroupWelcome.group.welcomeMessage).toBeNull()
	})

	it("refuses members and messages over the limit", async () => {
		const { group, admin, joiner } = await seedGroup()
		const asMember = await expectData<{ updateGroupWelcome: ErrorResult }>(
			UPDATE_WELCOME,
			{
				as: joiner,
				variables: { input: { groupId: group.id, welcomeMessage: "Hi" } },
			},
		)
		expect(asMember.updateGroupWelcome.__typename).toBe("AuthorizationError")

		const tooLong = await expectData<{ updateGroupWelcome: ErrorResult }>(
			UPDATE_WELCOME,
			{
				as: admin,
				variables: {
					input: { groupId: group.id, welcomeMessage: "x".repeat(501) },
				},
			},
		)
		expect(tooLong.updateGroupWelcome.__typename).toBe("ValidationError")
	})
})
