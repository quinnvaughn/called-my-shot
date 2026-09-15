import { describe, expect, it } from "vitest"
import { db } from "../db"
import { analyticsOutbox } from "../db/schema"
import { makeUser } from "../test/factories"
import { drainAnalyticsOutbox, type SendBatchFn } from "./analytics-outbox"

async function queue(userId: string, createdAt = new Date()) {
	const [row] = await db
		.insert(analyticsOutbox)
		.values({
			userId,
			event: "call_resolved",
			properties: { questionId: "q1", pointsDelta: 12 },
			createdAt,
		})
		.returning()
	return row
}

function recordingSend() {
	const batches: Parameters<SendBatchFn>[1][] = []
	const send: SendBatchFn = async (_apiKey, batch) => {
		batches.push(batch)
	}
	return { batches, send }
}

describe("drainAnalyticsOutbox", () => {
	it("holds every row when there is no PostHog key", async () => {
		const user = await makeUser()
		const row = await queue(user.id)
		const { batches, send } = recordingSend()

		const result = await drainAnalyticsOutbox({ send, apiKey: undefined })

		expect(result.sent).toBe(0)
		expect(batches).toHaveLength(0)
		const after = await db.query.analyticsOutbox.findFirst({
			where: { id: row.id },
		})
		expect(after?.sentAt).toBeNull()
		expect(after?.attempts).toBe(0)
	})

	it("sends as the user, keyed and timestamped by the row, then marks it sent", async () => {
		const user = await makeUser()
		const createdAt = new Date("2026-06-01T02:00:00.000Z")
		const row = await queue(user.id, createdAt)
		const { batches, send } = recordingSend()

		const result = await drainAnalyticsOutbox({ send, apiKey: "phc_test" })

		expect(result.sent).toBe(1)
		expect(batches).toHaveLength(1)
		expect(batches[0][0]).toMatchObject({
			uuid: row.id,
			event: "call_resolved",
			timestamp: createdAt.toISOString(),
			properties: {
				questionId: "q1",
				pointsDelta: 12,
				distinct_id: user.id,
			},
		})
		const after = await db.query.analyticsOutbox.findFirst({
			where: { id: row.id },
		})
		expect(after?.sentAt).toBeInstanceOf(Date)

		const again = recordingSend()
		await drainAnalyticsOutbox({ send: again.send, apiKey: "phc_test" })
		expect(again.batches).toHaveLength(0)
	})

	it("keeps a failed batch queued with the error for the next run", async () => {
		const user = await makeUser()
		const row = await queue(user.id)
		const failing: SendBatchFn = async () => {
			throw new Error("PostHog batch failed: 503")
		}

		const result = await drainAnalyticsOutbox({
			send: failing,
			apiKey: "phc_test",
		})

		expect(result.sent).toBe(0)
		const after = await db.query.analyticsOutbox.findFirst({
			where: { id: row.id },
		})
		expect(after?.sentAt).toBeNull()
		expect(after?.attempts).toBe(1)
		expect(after?.lastError).toContain("503")
	})
})
