import { createHmac, timingSafeEqual } from "node:crypto"
import type { EmailPreferenceType } from "../db/schema"
import { emailPreferenceType } from "../db/schema"
import { env } from "../env"

// Signed rather than stored. An unsubscribe link has to keep working
// indefinitely - someone can act on a year-old email, and a link that has
// quietly expired means a spam complaint instead of an opt-out - so there is
// nothing to expire, no column to migrate, and no row to look up before we
// know whether the token is even real. Rotating the secret revokes every
// outstanding link at once, which is the only revocation this needs.
//
// Only ever grants "mute this type for this user". It is not a session and
// must never be accepted as one.
const DEV_SECRET = "insecure-local-unsubscribe-secret-do-not-use-in-prod"

function secret(): string {
	return env.EMAIL_UNSUBSCRIBE_SECRET ?? DEV_SECRET
}

function sign(payload: string): string {
	return createHmac("sha256", secret()).update(payload).digest("base64url")
}

export function unsubscribeToken(
	userId: string,
	type: EmailPreferenceType,
): string {
	const payload = `${userId}:${type}`
	return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`
}

export function verifyUnsubscribeToken(
	token: string,
): { userId: string; type: EmailPreferenceType } | null {
	const [encoded, signature] = token.split(".")
	if (!encoded || !signature) return null

	const payload = Buffer.from(encoded, "base64url").toString()
	const expected = sign(payload)
	// Both are base64url of a sha256 digest, so they're always the same byte
	// length here and timingSafeEqual can't throw on a length mismatch - but
	// a caller-supplied signature of another length would, hence the guard.
	if (signature.length !== expected.length) return null
	if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
		return null
	}

	const separator = payload.lastIndexOf(":")
	if (separator === -1) return null
	const userId = payload.slice(0, separator)
	const type = payload.slice(separator + 1)
	if (!userId) return null
	if (!(emailPreferenceType.enumValues as readonly string[]).includes(type)) {
		return null
	}
	return { userId, type: type as EmailPreferenceType }
}

// The link the List-Unsubscribe header points at. Goes through the web app,
// not the api: the api has no public ingress (same reason routes/share.ts is
// proxied), and a mail provider's one-click POST has to reach it directly.
export function oneClickUnsubscribeUrl(
	userId: string,
	type: EmailPreferenceType,
): string {
	return `${env.CLIENT_ORIGIN}/unsubscribe/one-click?token=${unsubscribeToken(userId, type)}`
}

// The human-facing version, linked from the email footer.
export function unsubscribePageUrl(
	userId: string,
	type: EmailPreferenceType,
): string {
	return `${env.CLIENT_ORIGIN}/unsubscribe?token=${unsubscribeToken(userId, type)}`
}
