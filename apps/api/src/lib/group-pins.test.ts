import { describe, expect, it } from "vitest"
import { db } from "../db"
import { groupPins } from "../db/schema"
import { makeGroup, makeQuestion, makeUser } from "../test/factories"
import { hoursAgo, hoursFromNow } from "../test/helpers"
import { expireGroupPins } from "./group-pins"

describe("expireGroupPins", () => {
	it("deletes pins that can't be called and tells admins when the last one goes", async () => {
		const [admin, member] = await Promise.all([makeUser(), makeUser()])
		const emptied = await makeGroup({ admin, members: [member] })
		const kept = await makeGroup({ admin })
		const locked = await makeQuestion({ locksAt: hoursAgo(1) })
		const voided = await makeQuestion({ status: "voided" })
		const open = await makeQuestion({ locksAt: hoursFromNow(24) })
		await db.insert(groupPins).values([
			{ groupId: emptied.id, questionId: locked.id, position: 0 },
			{ groupId: emptied.id, questionId: voided.id, position: 1 },
			{ groupId: kept.id, questionId: locked.id, position: 0 },
			{ groupId: kept.id, questionId: open.id, position: 1 },
		])

		expect(await expireGroupPins()).toBe(3)

		const left = await db.query.groupPins.findMany()
		expect(left).toMatchObject([{ groupId: kept.id, questionId: open.id }])
		const notices = await db.query.notifications.findMany({
			where: { type: "group_pins_expired" },
		})
		expect(notices).toMatchObject([
			{ userId: admin.id, groupId: emptied.id, groupName: emptied.name },
		])

		expect(await expireGroupPins()).toBe(0)
		expect(
			await db.query.notifications.findMany({
				where: { type: "group_pins_expired" },
			}),
		).toHaveLength(1)
	})
})
