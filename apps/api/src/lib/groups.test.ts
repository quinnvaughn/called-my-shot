import { DateTime } from "luxon"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { groupMembers, groups } from "../db/schema"
import { makeUser } from "../test/factories"
import { getOrCreateMemberInvite, insertGroupInvite } from "./groups"

async function makeMember() {
	const user = await makeUser()
	const [group] = await db
		.insert(groups)
		.values({ name: "Test group", createdBy: user.id })
		.returning()
	await db
		.insert(groupMembers)
		.values({ groupId: group.id, userId: user.id, role: "admin" })
	return { user, group }
}

describe("getOrCreateMemberInvite", () => {
	it("creates a link that never expires", async () => {
		const { user, group } = await makeMember()

		const invite = await getOrCreateMemberInvite(group.id, user.id)

		expect(invite.expiresAt).toBeNull()
	})

	it("replaces an expired link with a fresh one that never expires", async () => {
		const { user, group } = await makeMember()
		const expired = await insertGroupInvite(
			group.id,
			user.id,
			DateTime.now().minus({ days: 1 }).toJSDate(),
		)

		const invite = await getOrCreateMemberInvite(group.id, user.id)

		expect(invite.id).toBe(expired.id)
		expect(invite.code).not.toBe(expired.code)
		expect(invite.expiresAt).toBeNull()
	})

	it("leaves a link that hasn't expired alone", async () => {
		const { user, group } = await makeMember()
		const live = await insertGroupInvite(
			group.id,
			user.id,
			DateTime.now().plus({ days: 1 }).toJSDate(),
		)

		const invite = await getOrCreateMemberInvite(group.id, user.id)

		expect(invite.code).toBe(live.code)
		expect(invite.expiresAt).toEqual(live.expiresAt)
	})
})
