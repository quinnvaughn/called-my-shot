import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { groupMembers, groups } from "../../../db/schema"
import { makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

// The invite card on a group's page can be hidden, one member at a time.

const DISMISS = /* GraphQL */ `
	mutation Dismiss($groupId: ID!) {
		dismissGroupInviteCard(groupId: $groupId) {
			__typename
			... on Group { viewerDismissedInviteCard }
		}
	}
`

const GROUP = /* GraphQL */ `
	query Group($id: ID!) {
		group(id: $id) { viewerDismissedInviteCard }
	}
`

type DismissResult =
	| { __typename: "Group"; viewerDismissedInviteCard: boolean }
	| ErrorResult

async function makeGroup() {
	const admin = await makeUser()
	const member = await makeUser()
	const [group] = await db
		.insert(groups)
		.values({ name: "Test group", createdBy: admin.id })
		.returning()
	await db.insert(groupMembers).values([
		{ groupId: group.id, userId: admin.id, role: "admin" },
		{ groupId: group.id, userId: member.id },
	])
	return { group, admin, member }
}

describe("group invite card", () => {
	it("hides it for the member who dismissed it and nobody else", async () => {
		const { group, admin, member } = await makeGroup()

		const dismissed = await expectData<{ dismissGroupInviteCard: DismissResult }>(
			DISMISS,
			{ as: member, variables: { groupId: group.id } },
		)
		expect(dismissed.dismissGroupInviteCard).toMatchObject({
			__typename: "Group",
			viewerDismissedInviteCard: true,
		})

		const asMember = await expectData<{
			group: { viewerDismissedInviteCard: boolean }
		}>(GROUP, { as: member, variables: { id: group.id } })
		const asAdmin = await expectData<{
			group: { viewerDismissedInviteCard: boolean }
		}>(GROUP, { as: admin, variables: { id: group.id } })

		expect(asMember.group.viewerDismissedInviteCard).toBe(true)
		expect(asAdmin.group.viewerDismissedInviteCard).toBe(false)
	})

	it("refuses someone who isn't in the group", async () => {
		const { group } = await makeGroup()
		const outsider = await makeUser()

		const data = await expectData<{ dismissGroupInviteCard: DismissResult }>(
			DISMISS,
			{ as: outsider, variables: { groupId: group.id } },
		)

		expect(data.dismissGroupInviteCard.__typename).toBe("AuthorizationError")
	})
})
