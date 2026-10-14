import { and, eq, gt, inArray } from "drizzle-orm"
import { db } from "../db"
import {
	type PushSubscriptionRow,
	pushSubscriptions,
	sessions,
} from "../db/schema"
import type { DbOrTx } from "../db/types"

export type PushPlatform = PushSubscriptionRow["platform"]

export type PushSubscriptionInput = {
	endpoint: string
	p256dh: string
	auth: string
	platform: PushPlatform
	standalone: boolean
	userAgent: string | null
}

// The push services browsers actually hand out endpoints on. Anything else is
// refused: the drain POSTs to whatever endpoint is stored, so accepting any
// URL would let a signed-in user point the server's requests anywhere.
const PUSH_SERVICE_HOSTS: (string | RegExp)[] = [
	"fcm.googleapis.com",
	"web.push.apple.com",
	/^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
	/^[a-z0-9-]+\.notify\.windows\.com$/,
]

export function isAllowedPushEndpoint(endpoint: string): boolean {
	let url: URL
	try {
		url = new URL(endpoint)
	} catch {
		return false
	}
	if (url.protocol !== "https:" || url.port !== "") return false
	return PUSH_SERVICE_HOSTS.some((host) =>
		typeof host === "string" ? url.hostname === host : host.test(url.hostname),
	)
}

// Upserts on the endpoint, so the same browser re-saving moves the row to
// whoever is signed in now and to their current session.
export async function savePushSubscription(
	userId: string,
	sessionId: string,
	input: PushSubscriptionInput,
	now = new Date(),
): Promise<void> {
	await db
		.insert(pushSubscriptions)
		.values({ userId, sessionId, ...input, lastSeenAt: now })
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: {
				userId,
				sessionId,
				p256dh: input.p256dh,
				auth: input.auth,
				platform: input.platform,
				standalone: input.standalone,
				userAgent: input.userAgent,
				lastSeenAt: now,
				failureCount: 0,
				lastError: null,
			},
		})
}

export async function removePushSubscription(
	userId: string,
	endpoint: string,
): Promise<void> {
	await db
		.delete(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.userId, userId),
				eq(pushSubscriptions.endpoint, endpoint),
			),
		)
}

// The devices a push can go to right now: the session each was saved under
// must still be live. Keyed by user.
export async function loadLiveSubscriptions(
	userIds: string[],
	now: Date,
	tx: DbOrTx = db,
): Promise<Map<string, PushSubscriptionRow[]>> {
	const byUser = new Map<string, PushSubscriptionRow[]>()
	if (userIds.length === 0) return byUser
	const rows = await tx
		.select({ subscription: pushSubscriptions })
		.from(pushSubscriptions)
		.innerJoin(sessions, eq(sessions.id, pushSubscriptions.sessionId))
		.where(
			and(
				inArray(pushSubscriptions.userId, userIds),
				gt(sessions.expiresAt, now),
			),
		)
	for (const { subscription } of rows) {
		const list = byUser.get(subscription.userId) ?? []
		list.push(subscription)
		byUser.set(subscription.userId, list)
	}
	return byUser
}

// Which of these users have any device at all, live session or not. The
// enqueue's cheap first cut: most people never turn push on, and they should
// cost no outbox rows.
export async function usersWithSubscriptions(
	tx: DbOrTx,
	userIds: string[],
): Promise<Set<string>> {
	if (userIds.length === 0) return new Set()
	const rows = await tx
		.selectDistinct({ userId: pushSubscriptions.userId })
		.from(pushSubscriptions)
		.where(inArray(pushSubscriptions.userId, userIds))
	return new Set(rows.map((r) => r.userId))
}
