import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
	isPermanentBounce,
	recipientOf,
	verifyResendSignature,
} from "./resend-webhook"

const SECRET = `whsec_${Buffer.from("a-test-signing-key").toString("base64")}`
const NOW = 1_770_000_000_000

function sign(body: string, id = "msg_1", timestampMs = NOW): string {
	const timestamp = Math.floor(timestampMs / 1000)
	const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64")
	const signature = createHmac("sha256", key)
		.update(`${id}.${timestamp}.${body}`)
		.digest("base64")
	return `v1,${signature}`
}

function headers(body: string, id = "msg_1", timestampMs = NOW) {
	return {
		id,
		timestamp: String(Math.floor(timestampMs / 1000)),
		signature: sign(body, id, timestampMs),
	}
}

describe("verifyResendSignature", () => {
	const body = JSON.stringify({ type: "email.bounced" })

	it("accepts a correctly signed payload", () => {
		expect(verifyResendSignature(body, headers(body), SECRET, NOW)).toBe(true)
	})

	it("rejects a payload whose body was altered after signing", () => {
		const signed = headers(body)
		expect(
			verifyResendSignature('{"type":"email.delivered"}', signed, SECRET, NOW),
		).toBe(false)
	})

	it("rejects a signature made with a different secret", () => {
		const other = `whsec_${Buffer.from("not-the-key").toString("base64")}`
		expect(verifyResendSignature(body, headers(body), other, NOW)).toBe(false)
	})

	// Without the replay window a captured payload stays valid forever, since
	// the signature itself never expires.
	it("rejects a payload older than the replay window", () => {
		const old = NOW - 10 * 60 * 1000
		expect(
			verifyResendSignature(body, headers(body, "msg_1", old), SECRET, NOW),
		).toBe(false)
	})

	it("rejects a timestamp too far in the future", () => {
		const ahead = NOW + 10 * 60 * 1000
		expect(
			verifyResendSignature(body, headers(body, "msg_1", ahead), SECRET, NOW),
		).toBe(false)
	})

	it("rejects when the id differs from the one that was signed", () => {
		const signed = headers(body, "msg_1")
		expect(
			verifyResendSignature(body, { ...signed, id: "msg_2" }, SECRET, NOW),
		).toBe(false)
	})

	it("rejects missing or malformed headers", () => {
		expect(
			verifyResendSignature(
				body,
				{ id: undefined, timestamp: undefined, signature: undefined },
				SECRET,
				NOW,
			),
		).toBe(false)
		expect(
			verifyResendSignature(
				body,
				{ id: "msg_1", timestamp: "not-a-number", signature: "v1,x" },
				SECRET,
				NOW,
			),
		).toBe(false)
	})

	// Svix sends several versioned signatures during a secret rotation.
	it("accepts when any one of several signatures matches", () => {
		const signed = headers(body)
		const multi = { ...signed, signature: `v1,bogus ${signed.signature}` }
		expect(verifyResendSignature(body, multi, SECRET, NOW)).toBe(true)
	})
})

describe("isPermanentBounce", () => {
	it("treats a transient bounce as recoverable", () => {
		expect(
			isPermanentBounce({
				type: "email.bounced",
				data: { bounce: { type: "Transient" } },
			}),
		).toBe(false)
	})

	it("treats a permanent bounce as broken", () => {
		expect(
			isPermanentBounce({
				type: "email.bounced",
				data: { bounce: { type: "Permanent" } },
			}),
		).toBe(true)
	})

	// Surfacing a false banner is recoverable by the person reading it;
	// swallowing a real bounce is the failure this feature exists to prevent.
	it("treats an unknown bounce type as broken", () => {
		expect(isPermanentBounce({ type: "email.bounced", data: {} })).toBe(true)
	})
})

describe("recipientOf", () => {
	it("reads the first address of an array", () => {
		expect(
			recipientOf({ type: "email.bounced", data: { to: ["a@b.com"] } }),
		).toBe("a@b.com")
	})

	it("reads a bare string", () => {
		expect(
			recipientOf({ type: "email.bounced", data: { to: "a@b.com" } }),
		).toBe("a@b.com")
	})

	it("returns null when there is no recipient", () => {
		expect(recipientOf({ type: "email.bounced", data: {} })).toBeNull()
	})
})
