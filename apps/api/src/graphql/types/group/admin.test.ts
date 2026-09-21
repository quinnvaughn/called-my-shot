import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { groupMembers } from "../../../db/schema"
import { insertGroupInvite } from "../../../lib/groups"
import { makeGroup, makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

// Admins are equals: any admin can promote, demote (another admin or
// themselves) and remove, as long as the group keeps at least one admin.

async function roleOf(groupId: string, userId: string) {
	const membership = await db.query.groupMembers.findFirst({
		where: { groupId, userId },
	})
	return membership?.role ?? null
}

const SET_ROLE = /* GraphQL */ `
	mutation SetRole($groupId: ID!, $userId: ID!, $role: GroupRole!) {
		setGroupMemberRole(groupId: $groupId, userId: $userId, role: $role) {
			__typename
			... on GroupMember { role }
			... on AuthorizationError { message }
			... on ValidationError { message }
		}
	}
`

type SetRoleResult = {
	setGroupMemberRole: { __typename: "GroupMember"; role: string } | ErrorResult
}

const REMOVE = /* GraphQL */ `
	mutation Remove($groupId: ID!, $userId: ID!) {
		removeGroupMember(groupId: $groupId, userId: $userId) {
			__typename
		}
	}
`

const LEAVE = /* GraphQL */ `
	mutation Leave($groupId: ID!) {
		leaveGroup(groupId: $groupId) {
			__typename
		}
	}
`

const DELETE = /* GraphQL */ `
	mutation Delete($groupId: ID!) {
		deleteGroup(groupId: $groupId) {
			__typename
		}
	}
`

const PREVIEW = /* GraphQL */ `
	query Preview($code: String!) {
		groupPreview(code: $code) { id }
	}
`

describe("setGroupMemberRole", () => {
	it("lets an admin promote a member", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin: admin, members: [member] })

		const data = await expectData<SetRoleResult>(SET_ROLE, {
			as: admin,
			variables: { groupId: group.id, userId: member.id, role: "ADMIN" },
		})

		expect(data.setGroupMemberRole).toEqual({
			__typename: "GroupMember",
			role: "ADMIN",
		})
	})

	it("refuses a member changing roles", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin: admin, members: [member] })

		const data = await expectData<SetRoleResult>(SET_ROLE, {
			as: member,
			variables: { groupId: group.id, userId: member.id, role: "ADMIN" },
		})

		expect(data.setGroupMemberRole.__typename).toBe("AuthorizationError")
		expect(await roleOf(group.id, member.id)).toBe("member")
	})

	it("lets an admin demote another admin", async () => {
		const first = await makeUser()
		const second = await makeUser()
		const group = await makeGroup({ admin: first })
		await db
			.insert(groupMembers)
			.values({ groupId: group.id, userId: second.id, role: "admin" })

		const data = await expectData<SetRoleResult>(SET_ROLE, {
			as: second,
			variables: { groupId: group.id, userId: first.id, role: "MEMBER" },
		})

		expect(data.setGroupMemberRole.__typename).toBe("GroupMember")
		expect(await roleOf(group.id, first.id)).toBe("member")
	})

	it("won't demote the last admin", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin: admin, members: [member] })

		const data = await expectData<SetRoleResult>(SET_ROLE, {
			as: admin,
			variables: { groupId: group.id, userId: admin.id, role: "MEMBER" },
		})

		expect(data.setGroupMemberRole.__typename).toBe("ValidationError")
		expect(await roleOf(group.id, admin.id)).toBe("admin")
	})
})

describe("a departed member's invite link", () => {
	it("stops working once they're removed", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin: admin, members: [member] })
		const invite = await insertGroupInvite(group.id, member.id, null)

		await expectData(REMOVE, {
			as: admin,
			variables: { groupId: group.id, userId: member.id },
		})

		const data = await expectData<{ groupPreview: { id: string } | null }>(
			PREVIEW,
			{ variables: { code: invite.code } },
		)
		expect(data.groupPreview).toBeNull()
	})

	it("stops working once they leave", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin: admin, members: [member] })
		const invite = await insertGroupInvite(group.id, member.id, null)

		await expectData(LEAVE, { as: member, variables: { groupId: group.id } })

		const data = await expectData<{ groupPreview: { id: string } | null }>(
			PREVIEW,
			{ variables: { code: invite.code } },
		)
		expect(data.groupPreview).toBeNull()
	})
})

describe("deleteGroup", () => {
	it("refuses a member", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin: admin, members: [member] })

		const data = await expectData<{ deleteGroup: ErrorResult }>(DELETE, {
			as: member,
			variables: { groupId: group.id },
		})

		expect(data.deleteGroup.__typename).toBe("AuthorizationError")
		expect(
			await db.query.groups.findFirst({ where: { id: group.id } }),
		).toBeDefined()
	})

	it("deletes the group for an admin", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin: admin, members: [member] })

		await expectData(DELETE, { as: admin, variables: { groupId: group.id } })

		expect(
			await db.query.groups.findFirst({ where: { id: group.id } }),
		).toBeUndefined()
	})
})
