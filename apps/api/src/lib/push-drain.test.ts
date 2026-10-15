import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import {
	notifications,
	pushOptOuts,
	pushOutbox,
	pushSubscriptions,
	sessions,
} from "../db/schema"
import {
	makeCall,
	makeGame,
	makePushSubscription,
	makeSelection,
	makeUser,
	seedOptionQuestion,
} from "../test/factories"
import { pushRecorder, resolve } from "../test/helpers"
import { createNotifications } from "./notifications"
import { clearPendingForTests, takePending } from "./pending-work"
import { drainPushOutbox } from "./push-drain"
import { HOUR_MS, MINUTE_MS } from "./time"

const later = (ms: number) => new Date(Date.now() + ms)
const outboxRows = () => db.select().from(pushOutbox)

async function redoEarned(userId: string) {
	const actor = await makeUser({ username: "rookie" })
	await db.transaction((tx) =>
		createNotifications(tx, [
			{
				type: "redo_earned",
				userId,
				actorId: actor.id,
				actorUsername: actor.username,
			},
		]),
	)
}

async function subscribedUser() {
	const user = await makeUser()
	const device = await makePushSubscription(user.id)
	return { user, device }
}

describe("drainPushOutbox", () => {
	it("sends a due push to the device and records what it said", async () => {
		const { user, device } = await subscribedUser()
		await redoEarned(user.id)

		const push = pushRecorder()
		const now = later(MINUTE_MS)
		expect(await drainPushOutbox({ send: push.send, now })).toEqual({
			sent: 1,
			skipped: 0,
			failed: 0,
		})

		expect(push.sent).toHaveLength(1)
		expect(push.sent[0].endpoint).toBe(device.endpoint)
		expect(push.sent[0].payload).toMatchObject({
			title: "You earned a redo",
			body: "@rookie made their first call.",
			type: "redo_earned",
		})
		expect(push.sent[0].payload.url).toBe(
			"/invite?utm_source=push&utm_medium=push&utm_campaign=redo_earned",
		)
		const [row] = await outboxRows()
		expect(push.sent[0].payload.notificationIds).toEqual([row.notificationId])
		expect(row).toMatchObject({
			skippedReason: null,
			deliveredCount: 1,
			title: "You earned a redo",
		})
		expect(row.sentAt).toEqual(now)
	})

	it("sends to every one of a user's devices", async () => {
		const { user } = await subscribedUser()
		await makePushSubscription(user.id)
		await redoEarned(user.id)

		const push = pushRecorder()
		await drainPushOutbox({ send: push.send, now: later(MINUTE_MS) })

		expect(push.sent).toHaveLength(2)
	})

	it("holds a game's results until its hold is over, then sends one push", async () => {
		const game = await makeGame({ status: "final" })
		const first = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
			question: { gameId: game.id },
		})
		const user = first.callers[0].user
		await makePushSubscription(user.id)
		const second = await seedOptionQuestion({
			callers: [],
			question: { gameId: game.id },
		})
		const call = await makeCall(second.question.id, user.id)
		await makeSelection(call.id, second.options[0].id, 100)
		await resolve(first.question, { correctOptionIds: [first.options[0].id] })
		await resolve(second.question, {
			correctOptionIds: [second.options[1].id],
		})

		const early = pushRecorder()
		await drainPushOutbox({ send: early.send, now: later(30_000) })
		expect(early.sent).toHaveLength(0)
		// Still waiting, so the next minute's tick looks again.
		expect(takePending("push")).toBe(true)

		const push = pushRecorder()
		await drainPushOutbox({ send: push.send, now: later(3 * MINUTE_MS) })
		expect(push.sent).toHaveLength(1)
		expect(push.sent[0].payload.tag).toBe(`game:${game.id}`)
		expect(push.sent[0].payload.body).toMatch(/^1 of 2 calls hit\./)
		expect(push.sent[0].payload.url).toMatch(
			new RegExp(`^/games/${game.id}/picks/${user.username}\\?`),
		)
		clearPendingForTests()
	})

	it("skips a push that would repeat the last one for the same key", async () => {
		const game = await makeGame({ status: "final" })
		const seeded = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
			question: { gameId: game.id },
		})
		const user = seeded.callers[0].user
		await makePushSubscription(user.id)
		await resolve(seeded.question, {
			correctOptionIds: [seeded.options[0].id],
		})
		const push = pushRecorder()
		await drainPushOutbox({ send: push.send, now: later(3 * MINUTE_MS) })

		// The game's notification fires again with nothing new on it, the way a
		// presser opening re-fires it.
		await db.transaction((tx) =>
			createNotifications(tx, [
				{ type: "game_resolved", userId: user.id, gameId: game.id },
			]),
		)
		await drainPushOutbox({ send: push.send, now: later(6 * MINUTE_MS) })

		expect(push.sent).toHaveLength(1)
		const rows = await outboxRows()
		expect(rows.map((r) => r.skippedReason)).toEqual(
			expect.arrayContaining([null, "unchanged"]),
		)
		expect(rows).toHaveLength(2)
	})

	it.each([
		["muted the type", "redo_earned" as const],
		["muted everything", "all" as const],
	])("skips a user who %s", async (_label, type) => {
		const { user } = await subscribedUser()
		await db.insert(pushOptOuts).values({ userId: user.id, type })
		await redoEarned(user.id)

		const push = pushRecorder()
		await drainPushOutbox({ send: push.send, now: later(MINUTE_MS) })

		expect(push.sent).toHaveLength(0)
		const [row] = await outboxRows()
		expect(row.skippedReason).toBe("muted")
	})

	it("skips a notification already read in-app", async () => {
		const { user } = await subscribedUser()
		await redoEarned(user.id)
		await db
			.update(notifications)
			.set({ readAt: later(30_000) })
			.where(eq(notifications.userId, user.id))

		const push = pushRecorder()
		await drainPushOutbox({ send: push.send, now: later(MINUTE_MS) })

		expect(push.sent).toHaveLength(0)
		const [row] = await outboxRows()
		expect(row.skippedReason).toBe("seen_in_app")
	})

	it("doesn't send to a device whose session has expired", async () => {
		const { user, device } = await subscribedUser()
		await db
			.update(sessions)
			.set({ expiresAt: new Date(Date.now() - HOUR_MS) })
			.where(eq(sessions.id, device.sessionId))
		await redoEarned(user.id)

		const push = pushRecorder()
		await drainPushOutbox({ send: push.send, now: later(MINUTE_MS) })

		expect(push.sent).toHaveLength(0)
		const [row] = await outboxRows()
		expect(row.skippedReason).toBe("no_subscription")
	})

	it("deletes a device its push service says is gone", async () => {
		const { user } = await subscribedUser()
		await redoEarned(user.id)

		const push = pushRecorder(410)
		await drainPushOutbox({ send: push.send, now: later(MINUTE_MS) })

		expect(await db.select().from(pushSubscriptions)).toHaveLength(0)
		const [row] = await outboxRows()
		expect(row.skippedReason).toBe("no_subscription")
	})

	it("retries a failed send until it runs out of attempts", async () => {
		const { user } = await subscribedUser()
		await redoEarned(user.id)

		const push = pushRecorder(500)
		for (let i = 0; i < 6; i++) {
			await drainPushOutbox({ send: push.send, now: later(MINUTE_MS) })
		}

		expect(push.sent).toHaveLength(5)
		const [row] = await outboxRows()
		expect(row).toMatchObject({ sentAt: null, attempts: 5 })
		expect(row.lastError).toContain("500")
		const [device] = await db.select().from(pushSubscriptions)
		expect(device.failureCount).toBe(5)
		clearPendingForTests()
	})

	it("drops a push that waited too long to still be news", async () => {
		const { user } = await subscribedUser()
		await redoEarned(user.id)

		const push = pushRecorder()
		await drainPushOutbox({ send: push.send, now: later(7 * HOUR_MS) })

		expect(push.sent).toHaveLength(0)
		const [row] = await outboxRows()
		expect(row.skippedReason).toBe("stale")
	})
})
