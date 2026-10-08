import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { makeGroup, makeUser } from "../../../test/factories"
import { expectData } from "../../../test/graphql"

// A site admin can open any group read-only without being in it. The fields
// that only make sense for a member come back empty rather than acting on
// the admin's behalf.

const GROUP = /* GraphQL */ `
	query Group($id: ID!) {
		group(id: $id) {
			id
			viewerIsMember
			viewerIsAdmin
			viewerRank
			myInvite { code }
		}
	}
`

const ADMIN_GROUPS = /* GraphQL */ `
	query AdminGroups($search: String) {
		adminGroups(search: $search) {
			__typename
			... on QueryAdminGroupsSuccess { data { id name } }
		}
	}
`

type GroupResult = {
	group: {
		id: string
		viewerIsMember: boolean
		viewerIsAdmin: boolean
		viewerRank: number | null
		myInvite: { code: string } | null
	} | null
}

type AdminGroupsResult = {
	adminGroups:
		| {
				__typename: "QueryAdminGroupsSuccess"
				data: { id: string; name: string }[]
		  }
		| { __typename: "AuthorizationError" }
}

describe("group", () => {
	it("opens for a site admin who isn't a member, without minting an invite", async () => {
		const [owner, siteAdmin] = await Promise.all([
			makeUser(),
			makeUser({ isAdmin: true }),
		])
		const group = await makeGroup({ admin: owner })

		const data = await expectData<GroupResult>(GROUP, {
			as: siteAdmin,
			variables: { id: group.id },
		})

		expect(data.group).toEqual({
			id: group.id,
			viewerIsMember: false,
			viewerIsAdmin: false,
			viewerRank: null,
			myInvite: null,
		})
		const invites = await db.query.groupInvites.findMany({
			where: { groupId: group.id, createdBy: siteAdmin.id },
		})
		expect(invites).toHaveLength(0)
	})

	it("stays hidden from a regular user who isn't a member", async () => {
		const [owner, outsider] = await Promise.all([makeUser(), makeUser()])
		const group = await makeGroup({ admin: owner })

		const data = await expectData<GroupResult>(GROUP, {
			as: outsider,
			variables: { id: group.id },
		})

		expect(data.group).toBeNull()
	})
})

describe("adminGroups", () => {
	it("lists groups the admin isn't in, filtered by name", async () => {
		const [owner, siteAdmin] = await Promise.all([
			makeUser(),
			makeUser({ isAdmin: true }),
		])
		const group = await makeGroup({ admin: owner, name: "Zebra Pundits" })

		const data = await expectData<AdminGroupsResult>(ADMIN_GROUPS, {
			as: siteAdmin,
			variables: { search: "zebra" },
		})

		expect(data.adminGroups).toMatchObject({
			__typename: "QueryAdminGroupsSuccess",
			data: [{ id: group.id, name: "Zebra Pundits" }],
		})
	})

	it("refuses a non-admin", async () => {
		const user = await makeUser()

		const data = await expectData<AdminGroupsResult>(ADMIN_GROUPS, {
			as: user,
		})

		expect(data.adminGroups.__typename).toBe("AuthorizationError")
	})
})
