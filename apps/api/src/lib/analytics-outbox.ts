import { inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { analyticsOutbox, type Question } from "../db/schema"
import { env } from "../env"
import type { Tx } from "./user-season-stats"

// Server-side counterpart to apps/web's AnalyticsEvents map. Property names
// match the browser events they get joined against (questionShape, leagueId,
// sportId, horizon as on call_submitted), so a funnel can treat both sides as
// one vocabulary.
type ServerAnalyticsEvents = {
	// One per caller whose call a resolution scored, whatever resolved it:
	// the ESPN jobs, a creator, an admin, or an overturned dispute.
	// pointsDelta is what the call is worth now, the same number the
	// notification shows. correct follows the app's own win line (points of 0
	// or more). rescored marks a call that already had a result, so a
	// return-after-resolution window can start from the first one.
	call_resolved: {
		questionId: string
		callId: string
		questionShape: Question["shape"]
		leagueId: string
		sportId: string
		horizon: "game" | "season"
		correct: boolean
		pointsDelta: number
		resolutionMethod: "system" | "creator" | "admin"
		rescored: boolean
	}
}

export type ServerAnalyticsEvent = {
	[E in keyof ServerAnalyticsEvents]: {
		event: E
		userId: string
		properties: ServerAnalyticsEvents[E]
	}
}[keyof ServerAnalyticsEvents]

// Takes the caller's transaction, so an event exists only if the thing it
// describes committed.
export async function enqueueAnalyticsEvents(
	tx: Tx,
	events: ServerAnalyticsEvent[],
): Promise<void> {
	if (events.length === 0) return
	await tx.insert(analyticsOutbox).values(events)
}

const POSTHOG_BATCH_URL = "https://us.i.posthog.com/batch/"
const BATCH_SIZE = 500
const MAX_ATTEMPTS = 10

type PostHogBatchEvent = {
	uuid: string
	event: string
	timestamp: string
	properties: Record<string, unknown>
}

export type SendBatchFn = (
	apiKey: string,
	batch: PostHogBatchEvent[],
) => Promise<void>

const sendBatch: SendBatchFn = async (apiKey, batch) => {
	const response = await fetch(POSTHOG_BATCH_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ api_key: apiKey, batch }),
	})
	if (!response.ok) {
		throw new Error(
			`PostHog batch failed: ${response.status} ${await response.text()}`,
		)
	}
}

// MUST be called under DRAIN_ANALYTICS_LOCK (lib/job-lock.ts): nothing here
// guards against a second drain selecting the same rows. `send` and `apiKey`
// are injectable so tests can see what would go out without a PostHog key.
export async function drainAnalyticsOutbox({
	send = sendBatch,
	apiKey = env.POSTHOG_KEY,
}: {
	send?: SendBatchFn
	apiKey?: string
} = {}): Promise<{ sent: number }> {
	if (!apiKey) return { sent: 0 }

	const rows = await db.query.analyticsOutbox.findMany({
		where: { sentAt: { isNull: true }, attempts: { lt: MAX_ATTEMPTS } },
		orderBy: { createdAt: "asc" },
		limit: BATCH_SIZE,
	})
	if (rows.length === 0) return { sent: 0 }

	const ids = rows.map((row) => row.id)
	await db
		.update(analyticsOutbox)
		.set({ attempts: sql`${analyticsOutbox.attempts} + 1` })
		.where(inArray(analyticsOutbox.id, ids))

	try {
		await send(
			apiKey,
			rows.map((row) => ({
				uuid: row.id,
				event: row.event,
				timestamp: row.createdAt.toISOString(),
				properties: {
					...(row.properties as Record<string, unknown>),
					distinct_id: row.userId,
					$lib: "called-my-shot-api",
				},
			})),
		)
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		await db
			.update(analyticsOutbox)
			.set({ lastError: message })
			.where(inArray(analyticsOutbox.id, ids))
		console.error("[analytics-outbox] send failed:", message)
		return { sent: 0 }
	}

	await db
		.update(analyticsOutbox)
		.set({ sentAt: new Date(), lastError: null })
		.where(inArray(analyticsOutbox.id, ids))
	return { sent: rows.length }
}
