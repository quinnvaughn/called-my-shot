import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { notifications } from "../db/schema"
import { makeGame, makeLeague, makeUser } from "../test/factories"
import { createNotifications, type NotificationInput } from "./notifications"
import { markPushRead } from "./push-read"

const write = (inputs: NotificationInput[]) =>
	db.transaction((tx) => createNotifications(tx, inputs))

const readState = async (userId: string) =>
	new Map(
		(
			await db
				.select({ id: notifications.id, readAt: notifications.readAt })
				.from(notifications)
				.where(eq(notifications.userId, userId))
		).map((row) => [row.id, row.readAt !== null]),
	)

describe("markPushRead", () => {
	it("marks the tapped notification and the earlier ones it replaced", async () => {
		const user = await makeUser()
		const sweep = {
			type: "sweep_completed" as const,
			userId: user.id,
			leagueId: (await makeLeague()).id,
			slateKey: "week-3",
			achievementLabel: "Week 3",
			achievementCount: 3,
		}
		const [first] = await write([sweep])
		const [second] = await write([sweep])
		const [otherSlate] = await write([{ ...sweep, slateKey: "week-4" }])

		await markPushRead(user.id, [second.id])

		const read = await readState(user.id)
		expect(read.get(first.id)).toBe(true)
		expect(read.get(second.id)).toBe(true)
		expect(read.get(otherSlate.id)).toBe(false)
	})

	it("marks only its own notification when nothing shares its key", async () => {
		const user = await makeUser()
		const game = await makeGame()
		const [tapped, other] = await write([
			{ type: "game_reminder", userId: user.id, gameId: game.id },
			{ type: "game_reminder", userId: user.id, gameId: game.id },
		])

		await markPushRead(user.id, [tapped.id])

		const read = await readState(user.id)
		expect(read.get(tapped.id)).toBe(true)
		expect(read.get(other.id)).toBe(false)
	})

	it("ignores ids that belong to someone else", async () => {
		const owner = await makeUser()
		const stranger = await makeUser()
		const game = await makeGame()
		const [notification] = await write([
			{ type: "game_reminder", userId: owner.id, gameId: game.id },
		])

		await markPushRead(stranger.id, [notification.id])

		expect((await readState(owner.id)).get(notification.id)).toBe(false)
	})
})
