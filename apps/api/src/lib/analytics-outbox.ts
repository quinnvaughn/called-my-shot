import { inArray } from "drizzle-orm"
import { db } from "../db"
import { analyticsOutbox, type Question } from "../db/schema"
import type { Tx } from "../db/types"
import { env } from "../env"
import { claimOutboxRows, markOutboxFailed, type Outbox } from "./outbox"
import { markPending } from "./pending-work"

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

	// The referral funnel, whose whole point is to make k-factor measurable.
	// The chain is referral_signup -> referral_qualified -> redo_granted ->
	// redo_spent, and each step is attributed to the user it happened TO, so
	// a referrer's events and their invitee's are separate people in PostHog
	// and the join between them is the explicit id property.

	// An account created through someone's code. On the INVITEE.
	referral_signup: {
		referrerId: string
		source: "invite_link" | "manual_code"
	}
	// The invitee's first call landed. On the REFERRER, since this is their
	// side of the bargain paying out. `outcome` is the part worth watching:
	// "queued" means the cap held a credit back, and a rising share of it
	// means REDO_BALANCE_CAP is the thing throttling the loop.
	referral_qualified: {
		inviteeId: string
		seasonId: string
		outcome: "granted" | "queued" | "rejected_season_cap"
		// How long the invitee took to go from signing up to calling. The
		// honest measure of whether an invite produced a real user.
		hoursFromSignup: number
		inviteeEmailVerified: boolean
	}
	// A redo actually landing in a wallet, whichever side earned it.
	redo_granted: {
		source: "referral" | "welcome" | "admin"
		balanceAfter: number
	}
	// A redo being spent. minutesToLock is the one that validates the whole
	// cost design: if redos cluster right before lock, the earliness forfeit
	// is doing real work, and if they cluster days out it is charging nothing.
	redo_spent: {
		callId: string
		questionId: string
		questionShape: Question["shape"]
		leagueId: string
		sportId: string
		horizon: "game" | "season"
		minutesToLock: number
		// How long the original call stood before being taken back.
		minutesSinceOriginalCall: number
		// A redo that keeps the same pick and only moves conviction is a
		// different act from one that flips sides.
		changedPick: boolean
		convictionDelta: number
		balanceAfter: number
	}

	// The post-game presser. Each is on the user who did the thing: the
	// owner for opened, answered and statement; the asker for asked. presserId
	// joins them, and joins the browser's presser_viewed.

	// Every presser that opens, engaged with or not - the denominator.
	// ownerInAGroup splits owners whose questions can come from friends from
	// owners who only ever hear from strangers and the app.
	presser_opened: {
		presserId: string
		gameId: string
		leagueId: string
		callCount: number
		ownerInAGroup: boolean
	}
	presser_question_asked: {
		presserId: string
		gameId: string
		source: "group" | "game_caller"
		askerFadedOwner: boolean
	}
	// minutesToAnswer runs from when the question was asked (or, for the
	// app's own questions, written on the owner's first look).
	presser_question_answered: {
		presserId: string
		source: "app" | "group" | "game_caller"
		noComment: boolean
		minutesToAnswer: number
	}
	presser_statement_posted: {
		presserId: string
		minutesSinceOpen: number
	}
	// Text the moderation check turned away. Never carries the text itself:
	// this is for spotting a filter that's too eager, not for reading what
	// was said.
	presser_text_blocked: {
		field: "statement" | "question" | "answer"
		category: "hate" | "threat" | "sexual" | "personal_info" | "harassment"
		strictness: "standard" | "strict"
	}
	// Gloat text the moderation check refused.
	gloat_text_blocked: {
		category: "hate" | "threat" | "sexual" | "personal_info" | "harassment"
		strictness: "standard" | "strict"
	}
	gloat_reported: {
		gloatId: string
		reason: string
	}
	presser_content_reported: {
		presserId: string
		target: "question" | "answer" | "statement"
		reason: string
	}
	// On the blocker. withdrawnQuestions is how many pending questions from
	// the blocked user the block cleared off the blocker's open pressers.
	user_blocked: {
		blockedUserId: string
		withdrawnQuestions: number
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
	markPending("analytics")
}

const POSTHOG_BATCH_URL = "https://us.i.posthog.com/batch/"
const BATCH_SIZE = 500

const OUTBOX: Outbox<typeof analyticsOutbox> = {
	table: analyticsOutbox,
	key: [analyticsOutbox.id],
	maxAttempts: 10,
}

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
	now = new Date(),
}: {
	send?: SendBatchFn
	apiKey?: string
	now?: Date
} = {}): Promise<{ sent: number }> {
	if (!apiKey) return { sent: 0 }

	const rows = (await claimOutboxRows(OUTBOX, { limit: BATCH_SIZE })).sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	)
	if (rows.length === 0) return { sent: 0 }

	const ids = rows.map((row) => row.id)

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
		await markOutboxFailed(
			analyticsOutbox,
			inArray(analyticsOutbox.id, ids),
			message,
		)
		console.error("[analytics-outbox] send failed:", message)
		return { sent: 0 }
	}

	await db
		.update(analyticsOutbox)
		.set({ sentAt: now, lastError: null })
		.where(inArray(analyticsOutbox.id, ids))
	return { sent: rows.length }
}
