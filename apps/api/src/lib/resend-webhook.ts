import { createHmac, timingSafeEqual } from "node:crypto"

// Resend signs webhooks with Svix. Verified by hand rather than pulling in
// the svix sdk: it's an HMAC over three known strings, and this is the whole
// of it.
//
// The signed content is `${id}.${timestamp}.${rawBody}` - RAW body, before
// any JSON parsing, since re-serializing changes key order and whitespace and
// the signature would never match again. That's why routes/webhooks.ts mounts
// express.raw() ahead of the express.json() the GraphQL mount uses.
const TOLERANCE_MS = 5 * 60 * 1000

export type WebhookHeaders = {
	id: string | undefined
	timestamp: string | undefined
	signature: string | undefined
}

export function verifyResendSignature(
	rawBody: string,
	headers: WebhookHeaders,
	secret: string,
	now = Date.now(),
): boolean {
	const { id, timestamp, signature } = headers
	if (!id || !timestamp || !signature) return false

	// Replay window. Without it a captured payload stays valid forever, since
	// the signature itself never expires.
	const sentAt = Number(timestamp) * 1000
	if (!Number.isFinite(sentAt)) return false
	if (Math.abs(now - sentAt) > TOLERANCE_MS) return false

	// Secrets are handed out as "whsec_<base64>"; the bytes after the prefix
	// are the actual key.
	const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
	const expected = createHmac("sha256", key)
		.update(`${id}.${timestamp}.${rawBody}`)
		.digest("base64")

	// The header carries a space-delimited list of versioned signatures
	// ("v1,<sig> v1,<sig>") so a secret can be rotated without downtime -
	// any one matching is a pass.
	return signature
		.split(" ")
		.filter((part) => part.startsWith("v1,"))
		.some((part) => {
			const candidate = part.slice(3)
			if (candidate.length !== expected.length) return false
			return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))
		})
}

export type ResendEvent = {
	type: string
	data: {
		to?: string[] | string
		bounce?: { type?: string; subType?: string; message?: string }
		failed?: { reason?: string }
	}
}

// Resend reports both hard ("Permanent") and soft ("Transient") bounces. Only
// a permanent one means the address is actually broken - a transient bounce is
// a full mailbox or a temporary server problem, and telling someone their
// email is dead over that would be wrong most of the time.
//
// An unrecognized/absent bounce type is treated as permanent: a false banner
// is recoverable by the person reading it, whereas silently swallowing a real
// bounce is the exact failure this whole feature exists to surface.
export function isPermanentBounce(event: ResendEvent): boolean {
	const type = event.data.bounce?.type
	if (!type) return true
	return type.toLowerCase() !== "transient"
}

export function recipientOf(event: ResendEvent): string | null {
	const to = event.data.to
	if (Array.isArray(to)) return to[0] ?? null
	return to ?? null
}
