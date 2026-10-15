import { createHash } from "node:crypto"
import { eq, inArray, sql } from "drizzle-orm"
import webpush from "web-push"
import { db } from "../db"
import { type PushSubscriptionRow, pushSubscriptions } from "../db/schema"
import { env } from "../env"

export function pushConfigured(): boolean {
	return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
}

export type PushTarget = Pick<
	PushSubscriptionRow,
	"id" | "endpoint" | "p256dh" | "auth"
>

export type PushSendOptions = {
	ttl: number
	urgency: "normal" | "high"
	topic: string
}

// Never throws: any failure comes back as a status code, 0 for one that never
// got an answer. Injected by tests the way SendFn is for mail.
export type PushSendFn = (
	target: PushTarget,
	payload: string,
	options: PushSendOptions,
) => Promise<{ statusCode: number; error?: string }>

export const webPushSend: PushSendFn = async (target, payload, options) => {
	const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env
	if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
		console.log(`[push] not configured, would send: ${payload}`)
		return { statusCode: 201 }
	}
	try {
		const result = await webpush.sendNotification(
			{
				endpoint: target.endpoint,
				keys: { p256dh: target.p256dh, auth: target.auth },
			},
			payload,
			{
				vapidDetails: {
					subject: VAPID_SUBJECT,
					publicKey: VAPID_PUBLIC_KEY,
					privateKey: VAPID_PRIVATE_KEY,
				},
				TTL: options.ttl,
				urgency: options.urgency,
				topic: options.topic,
			},
		)
		return { statusCode: result.statusCode }
	} catch (err) {
		if (err instanceof webpush.WebPushError) {
			return { statusCode: err.statusCode, error: err.body || err.message }
		}
		return {
			statusCode: 0,
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

// What a device shows. `path` is a path on the web app; the service worker
// opens it when the notification is tapped.
export type PushMessage = {
	title: string
	body: string
	path: string
	// The device-side tag: a later push with the same tag replaces this one.
	tag: string
	// Which notification type it announces, for the click's utm_campaign.
	type: string
	// The in-app notifications it announces, marked read when it's tapped.
	notificationIds: string[]
}

export function pushPayload(message: PushMessage): string {
	const url = new URL(message.path, "https://x.invalid")
	url.searchParams.set("utm_source", "push")
	url.searchParams.set("utm_medium", "push")
	url.searchParams.set("utm_campaign", message.type)
	return JSON.stringify({
		v: 1,
		title: message.title,
		body: message.body,
		url: `${url.pathname}${url.search}${url.hash}`,
		tag: message.tag,
		type: message.type,
		notificationIds: message.notificationIds,
	})
}

// The Topic header: a push service holding several undelivered messages with
// the same topic for an offline device delivers only the newest. At most 32
// characters from the URL-safe base64 alphabet.
export function pushTopic(tag: string): string {
	return createHash("sha256").update(tag).digest("base64url").slice(0, 32)
}

export type DeliveryResult = {
	// Devices whose push service accepted it.
	delivered: number
	// Devices whose subscription the push service says no longer exists. Their
	// rows are deleted here.
	gone: number
	// Devices that failed in a way worth retrying. The last error, if any.
	failed: number
	error: string | null
}

// Sends one message to every one of a user's devices, and keeps each
// subscription row's health in step with what its push service said.
export async function deliverPush(
	targets: PushTarget[],
	message: PushMessage,
	{ ttl, urgency }: { ttl: number; urgency: PushSendOptions["urgency"] },
	send: PushSendFn,
	now: Date,
): Promise<DeliveryResult> {
	const payload = pushPayload(message)
	const options = { ttl, urgency, topic: pushTopic(message.tag) }
	const results = await Promise.all(
		targets.map(async (target) => ({
			target,
			...(await send(target, payload, options)),
		})),
	)

	const ok = results.filter((r) => r.statusCode >= 200 && r.statusCode < 300)
	const gone = results.filter(
		(r) => r.statusCode === 404 || r.statusCode === 410,
	)
	const failed = results.filter((r) => !ok.includes(r) && !gone.includes(r))

	if (ok.length > 0) {
		await db
			.update(pushSubscriptions)
			.set({ lastSuccessAt: now, failureCount: 0, lastError: null })
			.where(
				inArray(
					pushSubscriptions.id,
					ok.map((r) => r.target.id),
				),
			)
	}
	if (gone.length > 0) {
		await db.delete(pushSubscriptions).where(
			inArray(
				pushSubscriptions.id,
				gone.map((r) => r.target.id),
			),
		)
	}
	for (const r of failed) {
		const error = `${r.statusCode}: ${r.error ?? "unknown"}`
		await db
			.update(pushSubscriptions)
			.set({
				lastFailureAt: now,
				failureCount: sql`${pushSubscriptions.failureCount} + 1`,
				lastError: error,
			})
			.where(eq(pushSubscriptions.id, r.target.id))
	}

	const lastFailed = failed.at(-1)
	return {
		delivered: ok.length,
		gone: gone.length,
		failed: failed.length,
		error: lastFailed
			? `${lastFailed.statusCode}: ${lastFailed.error ?? "unknown"}`
			: null,
	}
}
