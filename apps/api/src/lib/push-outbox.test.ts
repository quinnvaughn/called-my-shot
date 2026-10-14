import { describe, expect, it } from "vitest"
import { db } from "../db"
import { pushOutbox } from "../db/schema"
import {
	makeCall,
	makeGame,
	makePushSubscription,
	makeSelection,
	makeUser,
	seedOptionQuestion,
} from "../test/factories"
import { resolve } from "../test/helpers"
import { createNotifications } from "./notifications"
import { enqueuePushes } from "./push-outbox"
import { MINUTE_MS } from "./time"

const outboxRows = () => db.select().from(pushOutbox)

async function redoEarned(userId: string) {
	const actor = await makeUser()
	return db.transaction((tx) =>
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

describe("enqueuePushes", () => {
	it("queues a push only for a user with a device", async () => {
		const withDevice = await makeUser()
		const without = await makeUser()
		await makePushSubscription(withDevice.id)

		await redoEarned(withDevice.id)
		await redoEarned(without.id)

		const rows = await outboxRows()
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			userId: withDevice.id,
			type: "redo_earned",
			sentAt: null,
		})
	})

	it("never queues a game reminder or an expired-pins notice", async () => {
		const user = await makeUser()
		await makePushSubscription(user.id)
		const game = await makeGame()

		await db.transaction((tx) =>
			createNotifications(tx, [
				{ type: "game_reminder", userId: user.id, gameId: game.id },
			]),
		)

		expect(await outboxRows()).toHaveLength(0)
	})

	it("folds every result on one game into one held push", async () => {
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

		const rows = await outboxRows()
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			type: "game_resolved",
			collapseKey: `game:${game.id}`,
		})
		expect(rows[0].sendAfter.getTime()).toBeGreaterThan(Date.now())
	})

	it("caps how long later events can keep extending the hold", async () => {
		const user = await makeUser()
		await makePushSubscription(user.id)
		const game = await makeGame()
		const start = new Date("2026-09-13T20:00:00Z")
		const row = {
			userId: user.id,
			type: "game_resolved" as const,
			gameId: game.id,
			callId: null,
			leagueId: null,
			slateKey: null,
			dedupeKey: game.id,
		}
		const [notification] = await redoEarned(user.id)
		await db.delete(pushOutbox)

		for (const minutes of [0, 5, 9]) {
			await db.transaction((tx) =>
				enqueuePushes(
					tx,
					[{ ...row, id: notification.id }],
					new Date(start.getTime() + minutes * MINUTE_MS),
				),
			)
		}

		const [queued] = await outboxRows()
		expect(queued.sendAfter).toEqual(new Date(start.getTime() + 10 * MINUTE_MS))
	})
})
