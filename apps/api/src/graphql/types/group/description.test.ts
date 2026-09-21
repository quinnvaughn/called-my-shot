import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { groupMembers, groups } from "../../../db/schema"
import { insertGroupInvite } from "../../../lib/groups"
import { makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

// A group's description is an optional pitch: set at creation or from admin
// settings, shown on the public invite preview, and stored as null when blank
// so "no description" has exactly one representation.

const CREATE_GROUP = /* GraphQL */ `
	mutation CreateGroup($input: CreateGroupInput!) {
		createGroup(input: $input) {
			__typename
			... on GroupPayload { group { id description } }
			... on ValidationError { message }
		}
	}
`

const UPDATE_GROUP = /* GraphQL */ `
	mutation UpdateGroup($input: UpdateGroupInput!) {
		updateGroup(input: $input) {
			__typename
			... on GroupPayload { group { description } }
		}
	}
`

const PREVIEW = /* GraphQL */ `
	query Preview($code: String!) {
		groupPreview(code: $code) { description }
	}
`

type GroupResult =
	| {
			__typename: "GroupPayload"
			group: { id: string; description: string | null }
	  }
	| ErrorResult

describe("group description", () => {
	it("stores a trimmed description at creation", async () => {
		const user = await makeUser()

		const data = await expectData<{ createGroup: GroupResult }>(CREATE_GROUP, {
			as: user,
			variables: {
				input: {
					name: "Celtics Talk",
					description: "  NBA calls for r/bostonceltics  ",
				},
			},
		})

		expect(data.createGroup).toMatchObject({
			__typename: "GroupPayload",
			group: { description: "NBA calls for r/bostonceltics" },
		})
	})

	it("stores no description when it's left out or blank", async () => {
		const user = await makeUser()

		const omitted = await expectData<{ createGroup: GroupResult }>(
			CREATE_GROUP,
			{ as: user, variables: { input: { name: "Celtics Talk" } } },
		)
		const blank = await expectData<{ createGroup: GroupResult }>(CREATE_GROUP, {
			as: user,
			variables: { input: { name: "Celtics Talk", description: "   " } },
		})

		expect(omitted.createGroup).toMatchObject({ group: { description: null } })
		expect(blank.createGroup).toMatchObject({ group: { description: null } })
	})

	it("rejects a description over the limit", async () => {
		const user = await makeUser()

		const data = await expectData<{ createGroup: GroupResult }>(CREATE_GROUP, {
			as: user,
			variables: {
				input: { name: "Celtics Talk", description: "x".repeat(201) },
			},
		})

		expect(data.createGroup.__typename).toBe("ValidationError")
	})

	it("lets an admin change it and clear it", async () => {
		const admin = await makeUser()
		const [group] = await db
			.insert(groups)
			.values({ name: "Test group", createdBy: admin.id })
			.returning()
		await db
			.insert(groupMembers)
			.values({ groupId: group.id, userId: admin.id, role: "admin" })
		const base = { groupId: group.id, name: "Test group", leagueIds: [] }

		const set = await expectData<{ updateGroup: GroupResult }>(UPDATE_GROUP, {
			as: admin,
			variables: { input: { ...base, description: "Weekly bragging rights" } },
		})
		expect(set.updateGroup).toMatchObject({
			group: { description: "Weekly bragging rights" },
		})

		const cleared = await expectData<{ updateGroup: GroupResult }>(
			UPDATE_GROUP,
			{ as: admin, variables: { input: { ...base, description: "" } } },
		)
		expect(cleared.updateGroup).toMatchObject({ group: { description: null } })
	})

	it("shows on the public invite preview", async () => {
		const admin = await makeUser()
		const [group] = await db
			.insert(groups)
			.values({
				name: "Test group",
				description: "NBA calls for r/bostonceltics",
				createdBy: admin.id,
			})
			.returning()
		await db
			.insert(groupMembers)
			.values({ groupId: group.id, userId: admin.id, role: "admin" })
		const invite = await insertGroupInvite(group.id, admin.id, null)

		const data = await expectData<{
			groupPreview: { description: string | null }
		}>(PREVIEW, { variables: { code: invite.code } })

		expect(data.groupPreview.description).toBe("NBA calls for r/bostonceltics")
	})
})
