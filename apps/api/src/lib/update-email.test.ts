import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { emailOptOuts, updates } from "../db/schema"
import { env } from "../env"
import { makeUser } from "../test/factories"
import { mailRecorder } from "../test/helpers"
import {
	drainUpdateEmails,
	enqueueUpdateEmails,
	sendUpdateTestEmail,
} from "./update-email"

async function makeUpdate(
	overrides: Partial<typeof updates.$inferInsert> = {},
) {
	const [update] = await db
		.insert(updates)
		.values({
			title: "Face the press",
			summary: "Answer questions about your calls after a game.",
			body: "When a game ends you get a presser.\n\nSee [your home](/home).",
			slug: "face-the-press",
			publishedAt: new Date(),
			...overrides,
		})
		.returning()
	if (!update) throw new Error("update insert returned no row")
	return update
}

describe("enqueueUpdateEmails", () => {
	it("queues everyone subscribed, once", async () => {
		const update = await makeUpdate()
		const wanted = await makeUser()
		const mutedType = await makeUser()
		const mutedAll = await makeUser()
		await makeUser({ emailBouncedAt: new Date() })
		await db.insert(emailOptOuts).values([
			{ userId: mutedType.id, type: "product_updates" },
			{ userId: mutedAll.id, type: "all" },
		])

		expect(await enqueueUpdateEmails(update.id)).toEqual({
			ok: true,
			queued: 1,
		})
		const rows = await db.query.updateEmails.findMany()
		expect(rows.map((r) => r.userId)).toEqual([wanted.id])

		// A second press is refused rather than mailing everyone again.
		expect(await enqueueUpdateEmails(update.id)).toMatchObject({ ok: false })
		expect(await db.query.updateEmails.findMany()).toHaveLength(1)
	})

	it("refuses a draft", async () => {
		const draft = await makeUpdate({ publishedAt: null, slug: null })
		await makeUser()

		expect(await enqueueUpdateEmails(draft.id)).toEqual({
			ok: false,
			error: "Publish it before emailing it.",
		})
		const [row] = await db
			.select({ emailedAt: updates.emailedAt })
			.from(updates)
			.where(eq(updates.id, draft.id))
		expect(row?.emailedAt).toBeNull()
	})
})

describe("drainUpdateEmails", () => {
	it("sends the post and doesn't send it twice", async () => {
		const update = await makeUpdate()
		await makeUser({ email: "caller@example.com" })
		await enqueueUpdateEmails(update.id)

		const first = mailRecorder()
		expect(await drainUpdateEmails({ send: first.send })).toMatchObject({
			sent: 1,
		})
		const [mail] = first.sent
		expect(mail?.to).toBe("caller@example.com")
		expect(mail?.from).toBe(env.EMAIL_FROM_ANNOUNCEMENTS)
		expect(mail?.subject).toBe("Face the press")
		// The body's site-relative link carries the origin in an email.
		expect(mail?.html).toContain(`${env.CLIENT_ORIGIN}/home`)
		expect(mail?.text).toContain("/updates/face-the-press?utm_source=email")
		expect(mail?.headers?.["List-Unsubscribe"]).toBeDefined()

		const second = mailRecorder()
		await drainUpdateEmails({ send: second.send })
		expect(second.sent).toHaveLength(0)
	})

	it("stops sending a post unpublished after it was sent", async () => {
		const update = await makeUpdate()
		await makeUser()
		await enqueueUpdateEmails(update.id)
		await db
			.update(updates)
			.set({ publishedAt: null })
			.where(eq(updates.id, update.id))

		const mail = mailRecorder()
		expect(await drainUpdateEmails({ send: mail.send })).toMatchObject({
			sent: 0,
			skipped: 1,
		})
		const [row] = await db.query.updateEmails.findMany()
		expect(row?.skippedReason).toBe("update_unpublished")
	})

	it("skips someone who unsubscribed after it was sent", async () => {
		const update = await makeUpdate()
		const user = await makeUser()
		await enqueueUpdateEmails(update.id)
		await db
			.insert(emailOptOuts)
			.values({ userId: user.id, type: "product_updates" })

		const mail = mailRecorder()
		expect(await drainUpdateEmails({ send: mail.send })).toMatchObject({
			skipped: 1,
		})
		expect(mail.sent).toHaveLength(0)
	})
})

describe("sendUpdateTestEmail", () => {
	it("mails a draft to one person without queueing anything", async () => {
		const draft = await makeUpdate({ publishedAt: null, slug: null })
		const admin = await makeUser()

		const mail = mailRecorder()
		const result = await sendUpdateTestEmail({
			updateId: draft.id,
			userId: admin.id,
			to: admin.email,
			send: mail.send,
		})
		expect(result.ok).toBe(true)
		expect(mail.sent[0]?.subject).toBe("[Test] Face the press")
		expect(await db.query.updateEmails.findMany()).toHaveLength(0)
	})
})
