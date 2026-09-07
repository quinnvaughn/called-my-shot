import { eq, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { emailOutbox, type Question, questions } from "../db/schema"
import { seedOptionQuestion } from "../test/factories"
import { backfillResolutionEmails } from "./email-backfill"
import { drainResolutionDigests } from "./email-digest"
import type { MailMessage } from "./mailer"
import { resolveQuestionInternal } from "./resolve-question"

function resolve(question: Question, correctOptionIds: string[]) {
	return db.transaction((tx) =>
		resolveQuestionInternal(tx, question, {
			correctOptionIds,
			resolutionNote: "",
		}),
	)
}

/** Puts a question's resolution (and optionally its callers' signups) in the past. */
async function backdate(questionId: string, days: number) {
	await db
		.update(questions)
		.set({ resolvedAt: sql`now() - ${`${days} days`}::interval` })
		.where(eq(questions.id, questionId))
}

/** The state before the digest shipped: scored, but nothing ever queued. */
async function clearOutbox() {
	await db.delete(emailOutbox)
}

function recorder() {
	const sent: MailMessage[] = []
	return {
		sent,
		send: async (message: MailMessage) => {
			sent.push(message)
			return { ok: true } as const
		},
	}
}

describe("backfillResolutionEmails", () => {
	it("queues calls that resolved before the outbox existed", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, [options[0].id])
		await backdate(question.id, 2)
		await clearOutbox()

		const dry = await backfillResolutionEmails({ days: 7 })
		expect(dry.candidates).toBe(2)
		expect(dry.callsByUser.size).toBe(2)
		// A dry run must not write anything.
		expect(dry.queued).toBe(0)
		expect(await db.select().from(emailOutbox)).toHaveLength(0)

		const run = await backfillResolutionEmails({ days: 7, commit: true })
		expect(run.queued).toBe(2)
		const rows = await db.select().from(emailOutbox)
		expect(rows).toHaveLength(2)
		expect(new Set(rows.map((r) => r.userId))).toEqual(
			new Set(callers.map((c) => c.user.id)),
		)
	})

	it("ignores resolutions older than the window", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		await backdate(question.id, 30)
		await clearOutbox()

		const result = await backfillResolutionEmails({ days: 7, commit: true })
		expect(result.candidates).toBe(0)
		expect(await db.select().from(emailOutbox)).toHaveLength(0)
	})

	// The whole point of re-runnability: the operator can dry-run, commit, and
	// run it again without anyone getting a second copy.
	it("never queues a call that already has a row", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		await backdate(question.id, 2)
		// Deliberately NOT cleared - resolve() already queued this call.

		const result = await backfillResolutionEmails({ days: 7, commit: true })
		expect(result.candidates).toBe(0)
		expect(await db.select().from(emailOutbox)).toHaveLength(1)
	})

	// A previously-SENT row isn't covered by the partial unique index, so the
	// "not exists" check is the only thing standing between a re-run and a
	// duplicate email.
	it("never re-queues a call whose email already went out", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		await db
			.update(emailOutbox)
			.set({ createdAt: sql`now() - interval '30 minutes'` })
		await drainResolutionDigests({ send: recorder().send })
		await backdate(question.id, 2)

		const result = await backfillResolutionEmails({ days: 7, commit: true })
		expect(result.candidates).toBe(0)
		const rows = await db.select().from(emailOutbox)
		expect(rows).toHaveLength(1)
		expect(rows[0].sentAt).not.toBeNull()
	})

	// The status filter is in the SQL, so a disputed question never even
	// becomes a candidate - `dropped` is reserved for rows that pass the query
	// but that the loader still can't describe.
	it("never considers a call whose question is no longer resolved", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, [options[0].id])
		await backdate(question.id, 2)
		await clearOutbox()
		await db
			.update(questions)
			.set({ status: "disputed" })
			.where(eq(questions.id, question.id))

		const result = await backfillResolutionEmails({ days: 7, commit: true })
		expect(result.candidates).toBe(0)
		expect(result.queued).toBe(0)
		expect(await db.select().from(emailOutbox)).toHaveLength(0)
	})

	it("skips unresolved questions entirely", async () => {
		await seedOptionQuestion({ callers: [{ optionIndex: 0 }] })
		const result = await backfillResolutionEmails({ days: 7, commit: true })
		expect(result.candidates).toBe(0)
	})

	// End to end: what the operator actually cares about is that a backfilled
	// batch turns into one email per person, not one per call.
	it("produces a single email per user once drained", async () => {
		const first = await seedOptionQuestion({ callers: [{ optionIndex: 0 }] })
		const caller = first.callers[0]
		const second = await seedOptionQuestion({ callers: [] })
		const { makeCall, makeSelection } = await import("../test/factories")
		const secondCall = await makeCall(second.question.id, caller.user.id)
		await makeSelection(secondCall.id, second.options[0].id, 100)

		await resolve(first.question, [first.options[0].id])
		await resolve(second.question, [second.options[0].id])
		await backdate(first.question.id, 2)
		await backdate(second.question.id, 2)
		await clearOutbox()

		await backfillResolutionEmails({ days: 7, commit: true })
		await db
			.update(emailOutbox)
			.set({ createdAt: sql`now() - interval '30 minutes'` })

		const mail = recorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(1)
		expect(mail.sent[0].to).toBe(caller.user.email)
		expect(mail.sent[0].text).toContain(first.question.title)
		expect(mail.sent[0].text).toContain(second.question.title)
	})
})
