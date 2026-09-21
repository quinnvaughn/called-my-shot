import { describe, expect, it } from "vitest"
import { db } from "../db"
import { emailOptOuts, gameReminders } from "../db/schema"
import { makeGame, makeUser } from "../test/factories"
import { mailRecorder } from "../test/helpers"
import { drainGameReminders, setGameReminder } from "./game-reminders"
import { MINUTE_MS } from "./time"

const NOW = new Date("2026-09-13T20:00:00Z")
const minutesFromNow = (minutes: number) =>
	new Date(NOW.getTime() + minutes * MINUTE_MS)

async function remind(startsInMinutes: number) {
	const user = await makeUser()
	const game = await makeGame({ startsAt: minutesFromNow(startsInMinutes) })
	await setGameReminder(user.id, game.id)
	return { user, game }
}

const reminderRows = () => db.select().from(gameReminders)

const notificationsFor = (userId: string) =>
	db.query.notifications.findMany({ where: { userId, type: "game_reminder" } })

describe("drainGameReminders", () => {
	it("sends a reminder once its game is inside the lead window", async () => {
		const { user, game } = await remind(45)

		const mail = mailRecorder()
		expect(await drainGameReminders({ send: mail.send, now: NOW })).toEqual({
			sent: 1,
			muted: 0,
			failed: 0,
		})

		expect(mail.sent).toHaveLength(1)
		const [message] = mail.sent
		expect(message.to).toBe(user.email)
		expect(message.tags).toEqual([{ name: "type", value: "game_reminder" }])
		expect(message.headers?.["List-Unsubscribe"]).toContain(
			"/unsubscribe/one-click?token=",
		)
		expect(message.text).toContain("utm_campaign=game_reminder")

		const [row] = await reminderRows()
		expect(row).toMatchObject({ skippedReason: null, attempts: 1 })
		expect(row.sentAt).toEqual(NOW)
		const [notification] = await notificationsFor(user.id)
		expect(notification?.gameId).toBe(game.id)

		// Finished, so the next tick has nothing to send.
		const again = mailRecorder()
		await drainGameReminders({ send: again.send, now: NOW })
		expect(again.sent).toHaveLength(0)
	})

	it("holds a reminder whose game is further out than the lead window", async () => {
		await remind(90)

		const mail = mailRecorder()
		await drainGameReminders({ send: mail.send, now: NOW })

		expect(mail.sent).toHaveLength(0)
		const [row] = await reminderRows()
		expect(row).toMatchObject({ sentAt: null, attempts: 0 })
	})

	it("batches a game starting shortly after a due one into the same email", async () => {
		const { user } = await remind(50)
		const later = await makeGame({ startsAt: minutesFromNow(70) })
		await setGameReminder(user.id, later.id)

		const mail = mailRecorder()
		await drainGameReminders({ send: mail.send, now: NOW })

		expect(mail.sent).toHaveLength(1)
		expect((await reminderRows()).every((r) => r.sentAt !== null)).toBe(true)
	})

	it("finishes a muted user's reminder in-app only", async () => {
		const { user } = await remind(45)
		await db.insert(emailOptOuts).values({ userId: user.id, type: "all" })

		const mail = mailRecorder()
		expect(await drainGameReminders({ send: mail.send, now: NOW })).toEqual({
			sent: 0,
			muted: 1,
			failed: 0,
		})

		expect(mail.sent).toHaveLength(0)
		const [row] = await reminderRows()
		expect(row.skippedReason).toBe("muted")
		expect(row.sentAt).not.toBeNull()
		expect(await notificationsFor(user.id)).toHaveLength(1)
	})

	it("skips a reminder whose game has already started, in-app included", async () => {
		const { user } = await remind(-5)

		const mail = mailRecorder()
		await drainGameReminders({ send: mail.send, now: NOW })

		expect(mail.sent).toHaveLength(0)
		const [row] = await reminderRows()
		expect(row.skippedReason).toBe("game_started")
		expect(await notificationsFor(user.id)).toHaveLength(0)
	})

	it("retries a failed send, then falls back to the in-app notification", async () => {
		const { user } = await remind(45)
		const failing = mailRecorder({ ok: false, error: "resend exploded" })

		for (const attempt of [1, 2]) {
			expect(
				await drainGameReminders({ send: failing.send, now: NOW }),
			).toMatchObject({ failed: 1 })
			const [row] = await reminderRows()
			expect(row).toMatchObject({
				sentAt: null,
				attempts: attempt,
				lastError: "resend exploded",
			})
		}
		expect(await notificationsFor(user.id)).toHaveLength(0)

		// The last attempt: the email gives up, the notification still lands.
		await drainGameReminders({ send: failing.send, now: NOW })
		const [row] = await reminderRows()
		expect(row).toMatchObject({ attempts: 3, skippedReason: "send_failed" })
		expect(row.sentAt).not.toBeNull()
		expect(await notificationsFor(user.id)).toHaveLength(1)

		const after = mailRecorder()
		await drainGameReminders({ send: after.send, now: NOW })
		expect(after.sent).toHaveLength(0)
		expect(failing.sent).toHaveLength(3)
	})
})
