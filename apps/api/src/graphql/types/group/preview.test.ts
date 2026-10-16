import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { groupMembers, groups } from "../../../db/schema"
import { insertGroupInvite } from "../../../lib/groups"
import { makeUser } from "../../../test/factories"
import { expectData } from "../../../test/graphql"

// The public invite preview tells a signed-in member they're already in, so
// the page can send them to the group instead of offering to join it.

const PREVIEW = /* GraphQL */ `
	query Preview($code: String!) {
		groupPreview(code: $code) {
			viewerIsMember
			leaders { rank username points }
		}
	}
`

type Preview = {
	groupPreview: {
		viewerIsMember: boolean
		leaders: { rank: number; username: string; points: number }[]
	}
}

async function groupWithInvite() {
	const admin = await makeUser()
	const [group] = await db
		.insert(groups)
		.values({ name: "Test group", createdBy: admin.id })
		.returning()
	await db
		.insert(groupMembers)
		.values({ groupId: group.id, userId: admin.id, role: "admin" })
	const invite = await insertGroupInvite(group.id, admin.id, null)
	return { admin, code: invite.code }
}

describe("group invite preview", () => {
	it("says a member is already in", async () => {
		const { admin, code } = await groupWithInvite()
		const data = await expectData<Preview>(PREVIEW, {
			as: admin,
			variables: { code },
		})
		expect(data.groupPreview.viewerIsMember).toBe(true)
	})

	it("says a signed-in stranger isn't", async () => {
		const { code } = await groupWithInvite()
		const stranger = await makeUser()
		const data = await expectData<Preview>(PREVIEW, {
			as: stranger,
			variables: { code },
		})
		expect(data.groupPreview.viewerIsMember).toBe(false)
	})

	it("says a signed-out visitor isn't", async () => {
		const { code } = await groupWithInvite()
		const data = await expectData<Preview>(PREVIEW, { variables: { code } })
		expect(data.groupPreview.viewerIsMember).toBe(false)
	})

	it("lists no leaders before anyone has points", async () => {
		const { code } = await groupWithInvite()
		const data = await expectData<Preview>(PREVIEW, { variables: { code } })
		expect(data.groupPreview.leaders).toEqual([])
	})
})
