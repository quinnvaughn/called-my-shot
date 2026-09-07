import { eq, inArray, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import {
	emailOptOuts,
	emailOutbox,
	type Question,
	questions,
	users,
} from "../db/schema"
import { makeCall, makeSelection, seedOptionQuestion } from "../test/factories"
import { drainResolutionDigests } from "./email-digest"
import type { MailMessage, MailResult } from "./mailer"
import { resolveQuestionInternal } from "./resolve-question"

function resolve(question: Question, correctOptionIds: string[]) {
	return db.transaction((tx) =>
		resolveQuestionInternal(tx, question, {
			correctOptionIds,
			resolutionNote: "",
		}),
	)
}

/** Collects what would have gone out instead of calling Resend. */
function recorder(result: MailResult = { ok: true }) {
	const sent: MailMessage[] = []
	return {
		sent,
		send: async (message: MailMessage) => {
			sent.push(message)
			return result
		},
	}
}

/**
 * Rows are only picked up once their user's OLDEST row has cleared the
 * settling window, so every test that expects a send has to age them first.
 */
async function ageOutbox(minutes = 30) {
	await db
		.update(emailOutbox)
		.set({
			createdAt: sql`now() - ${`${minutes} minutes`}::interval`,
		})
		.where(sql`sent_at is null`)
}

describe("drainResolutionDigests", () => {
	it("coalesces a user's separate resolutions into one email", async () => {
		const first = await seedOptionQuestion({ callers: [{ optionIndex: 0 }] })
		const caller = first.callers[0]
		// The same person calling a second question - the Sunday-slate case
		// the digest exists for, where two games finish minutes apart.
		const second = await seedOptionQuestion({ callers: [] })
		const secondCall = await makeCall(second.question.id, caller.user.id)
		await makeSelection(secondCall.id, second.options[0].id, 100)

		await resolve(first.question, [first.options[0].id])
		await resolve(second.question, [second.options[0].id])
		await ageOutbox()

		const mail = recorder()
		const result = await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(1)
		expect(result.sent).toBe(2)
		const [message] = mail.sent
		expect(message.to).toBe(caller.user.email)
		expect(message.text).toContain(first.question.title)
		expect(message.text).toContain(second.question.title)
	})

	it("leaves rows alone until the settling window passes", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])

		const mail = recorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(0)
		const pending = await db
			.select()
			.from(emailOutbox)
			.where(sql`sent_at is null`)
		expect(pending).toHaveLength(1)
	})

	it("sends one email per user, not one per call", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, [options[0].id])
		await ageOutbox()

		const mail = recorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(2)
		expect(new Set(mail.sent.map((m) => m.to)).size).toBe(2)
	})

	it("skips a user who muted call results", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await db
			.insert(emailOptOuts)
			.values({ userId: callers[0].user.id, type: "call_resolved" })
		await resolve(question, [options[0].id])
		await ageOutbox()

		const mail = recorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(0)
		const [row] = await db.select().from(emailOutbox)
		expect(row.skippedReason).toBe("muted")
		// Resolved, not left pending - a skip is a finished state.
		expect(row.sentAt).not.toBeNull()
	})

	it("skips a user who muted everything", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await db
			.insert(emailOptOuts)
			.values({ userId: callers[0].user.id, type: "all" })
		await resolve(question, [options[0].id])
		await ageOutbox()

		const mail = recorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(0)
		const [row] = await db.select().from(emailOutbox)
		expect(row.skippedReason).toBe("muted")
	})

	// emailVerified gates question creation, not mail. Asserted rather than
	// left unsaid so the gate doesn't get reintroduced as an obvious-looking
	// deliverability tweak - it would silently withhold results from everyone
	// who signed up before the confirm flow existed.
	it("mails an unverified address", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await db
			.update(users)
			.set({ emailVerified: false })
			.where(eq(users.id, callers[0].user.id))
		await resolve(question, [options[0].id])
		await ageOutbox()

		const mail = recorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(1)
		expect(mail.sent[0].to).toBe(callers[0].user.email)
	})

	it("drops a call whose question stopped being resolved", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		// A dispute filed inside the settling window - the result is contested
		// and the share card the email points at would 404.
		await db
			.update(questions)
			.set({ status: "disputed" })
			.where(eq(questions.id, question.id))
		await ageOutbox()

		const mail = recorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(0)
		const [row] = await db.select().from(emailOutbox)
		expect(row.skippedReason).toBe("no_longer_resolved")
	})

	it("carries a working one-click unsubscribe header", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		await ageOutbox()

		const mail = recorder()
		await drainResolutionDigests({ send: mail.send })

		const [message] = mail.sent
		expect(message.headers?.["List-Unsubscribe-Post"]).toBe(
			"List-Unsubscribe=One-Click",
		)
		expect(message.headers?.["List-Unsubscribe"]).toContain(
			"/unsubscribe/one-click?token=",
		)
		expect(message.tags).toEqual([{ name: "type", value: "resolution_digest" }])
	})

	it("leaves a failed send pending and counts the attempt", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		await ageOutbox()

		const mail = recorder({ ok: false, error: "resend exploded" })
		await drainResolutionDigests({ send: mail.send })

		const [row] = await db.select().from(emailOutbox)
		expect(row.sentAt).toBeNull()
		expect(row.attempts).toBe(1)
		expect(row.lastError).toBe("resend exploded")
	})

	it("gives up on a row that has failed too many times", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		await ageOutbox()
		await db.update(emailOutbox).set({ attempts: 5 })

		const mail = recorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(0)
	})

	it("does not re-send a batch that already went out", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		await ageOutbox()

		const first = recorder()
		await drainResolutionDigests({ send: first.send })
		expect(first.sent).toHaveLength(1)

		const second = recorder()
		await drainResolutionDigests({ send: second.send })
		expect(second.sent).toHaveLength(0)
	})
})

describe("resolveQuestionInternal enqueueing", () => {
	it("queues one row per scored caller", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, [options[0].id])

		const rows = await db.select().from(emailOutbox)
		expect(rows).toHaveLength(2)
		expect(rows.every((r) => r.type === "call_resolved")).toBe(true)
		expect(new Set(rows.map((r) => r.userId))).toEqual(
			new Set(callers.map((c) => c.user.id)),
		)
		expect(new Set(rows.map((r) => r.callId))).toEqual(
			new Set(callers.map((c) => c.call.id)),
		)
	})

	it("does not duplicate an unsent row when the same question re-resolves", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		// What overturnDispute does: re-run the scoring pass with the other
		// outcome while the first email is still queued.
		await resolve(question, [options[1].id])

		const rows = await db.select().from(emailOutbox)
		expect(rows).toHaveLength(1)
	})

	it("queues again once the first email has been sent, so a re-score is reported", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		await ageOutbox()
		await drainResolutionDigests({ send: recorder().send })

		await resolve(question, [options[1].id])

		const rows = await db.select().from(emailOutbox)
		expect(rows).toHaveLength(2)
		const pending = rows.filter((r) => r.sentAt === null)
		expect(pending).toHaveLength(1)
	})

	it("deletes queued rows when the question goes away", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		expect(await db.select().from(emailOutbox)).toHaveLength(1)

		// voidQuestion hard-deletes the question; the cascade is what keeps the
		// drain from ever describing a question that no longer exists.
		await db.delete(questions).where(inArray(questions.id, [question.id]))
		expect(await db.select().from(emailOutbox)).toHaveLength(0)
	})
})
