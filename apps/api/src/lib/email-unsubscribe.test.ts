import { describe, expect, it } from "vitest"
import {
	oneClickUnsubscribeUrl,
	unsubscribeToken,
	verifyUnsubscribeToken,
} from "./email-unsubscribe"

const USER_ID = "11111111-1111-1111-1111-111111111111"

describe("unsubscribe tokens", () => {
	it("round-trips a user and type", () => {
		const token = unsubscribeToken(USER_ID, "call_resolved")
		expect(verifyUnsubscribeToken(token)).toEqual({
			userId: USER_ID,
			type: "call_resolved",
		})
	})

	it("rejects a tampered signature", () => {
		const token = unsubscribeToken(USER_ID, "call_resolved")
		const [payload, signature] = token.split(".")
		// Flip one character of the signature rather than truncating it - a
		// length change would be caught by the cheap guard before the
		// constant-time compare, which is not the interesting case.
		const flipped = `${signature?.[0] === "A" ? "B" : "A"}${signature?.slice(1)}`
		expect(verifyUnsubscribeToken(`${payload}.${flipped}`)).toBeNull()
	})

	it("rejects a payload swapped to another user", () => {
		const token = unsubscribeToken(USER_ID, "call_resolved")
		const signature = token.split(".")[1]
		const forged = Buffer.from(
			"22222222-2222-2222-2222-222222222222:all",
		).toString("base64url")
		expect(verifyUnsubscribeToken(`${forged}.${signature}`)).toBeNull()
	})

	it("rejects a malformed token", () => {
		expect(verifyUnsubscribeToken("")).toBeNull()
		expect(verifyUnsubscribeToken("no-separator")).toBeNull()
		expect(verifyUnsubscribeToken("a.b")).toBeNull()
	})

	it("rejects a type that isn't in the enum", () => {
		// Signed by us, so the signature is genuine - the enum check is the
		// only thing standing between this and an unknown preference row.
		const token = unsubscribeToken(USER_ID, "not_a_type" as never)
		expect(verifyUnsubscribeToken(token)).toBeNull()
	})

	it("builds a one-click url whose token verifies", () => {
		const url = oneClickUnsubscribeUrl(USER_ID, "all")
		const token = new URL(url).searchParams.get("token")
		expect(token).toBeTruthy()
		expect(verifyUnsubscribeToken(token as string)).toEqual({
			userId: USER_ID,
			type: "all",
		})
	})
})
