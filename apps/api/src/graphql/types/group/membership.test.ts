import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { insertGroupInvite } from "../../../lib/groups"
import { makeGroup, makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

// Creating a group makes its creator the admin with an invite link of their
// own; joining by code adds a member once, however many times it's used.

const CREATE_GROUP = /* GraphQL */ `
	mutation CreateGroup($input: CreateGroupInput!) {
		createGroup(input: $input) {
			__typename
			... on GroupPayload {
				group { id viewerIsAdmin memberCount myInvite { code } }
			}
		}
	}
`

const JOIN = /* GraphQL */ `
	mutation Join($code: String!) {
		joinGroupByCode(input: { code: $code }) {
			__typename
			... on GroupPayload { group { id memberCount viewerIsAdmin } }
		}
	}
`

type CreateResult = {
	createGroup: {
		__typename: "GroupPayload"
		group: {
			id: string
			viewerIsAdmin: boolean
			memberCount: number
			myInvite: { code: string }
		}
	}
}

type JoinResult = {
	joinGroupByCode:
		| {
				__typename: "GroupPayload"
				group: { id: string; memberCount: number; viewerIsAdmin: boolean }
		  }
		| ErrorResult
}

describe("createGroup", () => {
	it("makes the creator its admin and hands them an invite link", async () => {
		const user = await makeUser()

		const data = await expectData<CreateResult>(CREATE_GROUP, {
			as: user,
			variables: { input: { name: "Celtics Talk" } },
		})

		expect(data.createGroup).toMatchObject({
			__typename: "GroupPayload",
			group: { viewerIsAdmin: true, memberCount: 1 },
		})
		const invites = await db.query.groupInvites.findMany({
			where: { groupId: data.createGroup.group.id },
		})
		expect(invites).toHaveLength(1)
		expect(invites[0]?.code).toBe(data.createGroup.group.myInvite.code)
	})
})

describe("joinGroupByCode", () => {
	it("adds the member once and tells the others once", async () => {
		const [admin, joiner] = await Promise.all([makeUser(), makeUser()])
		const group = await makeGroup({ admin })
		const invite = await insertGroupInvite(group.id, admin.id, null)

		for (let i = 0; i < 2; i++) {
			const data = await expectData<JoinResult>(JOIN, {
				as: joiner,
				variables: { code: invite.code },
			})
			expect(data.joinGroupByCode).toMatchObject({
				__typename: "GroupPayload",
				group: { id: group.id, memberCount: 2, viewerIsAdmin: false },
			})
		}

		const notified = await db.query.notifications.findMany({
			where: { userId: admin.id, type: "group_member_joined" },
		})
		expect(notified).toHaveLength(1)
	})

	it("refuses an unknown code", async () => {
		const user = await makeUser()
		const data = await expectData<JoinResult>(JOIN, {
			as: user,
			variables: { code: "NOPE22" },
		})
		expect(data.joinGroupByCode.__typename).toBe("ValidationError")
	})
})
