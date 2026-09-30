import { describe, expect, it } from "vitest"
import { db } from "../db"
import { sessions } from "../db/schema"
import { usernameBaseFromEmail } from "../lib/accounts"
import { redoBalanceFor } from "../lib/redos"
import { makeReferralCode, makeUser } from "../test/factories"
import { type Flow, resolveGoogleUser } from "./auth-google"

let n = 0
const identity = (extra: Partial<Parameters<typeof resolveGoogleUser>[0]> = {}) => {
	const i = `${++n}${Date.now() % 100000}`
	return {
		sub: `google-sub-${i}`,
		email: `googler${i}@gmail.com`,
		emailVerified: true,
		name: `Googler ${i}`,
		...extra,
	}
}

const flow = (referral: Flow["referral"] = null): Flow => ({
	state: "state",
	verifier: "verifier",
	returnTo: "/home",
	referral,
})

describe("usernameBaseFromEmail", () => {
	it("turns the email's local part into a handle", () => {
		expect(usernameBaseFromEmail("John.Smith@gmail.com", "John")).toBe(
			"john_smith",
		)
	})

	it("drops a plus-addressing tag", () => {
		expect(usernameBaseFromEmail("jane+sports@gmail.com", "Jane")).toBe("jane")
	})

	it("falls back to the name when the local part is too short", () => {
		expect(usernameBaseFromEmail("jo@x.com", "Jo Anne")).toBe("jo_anne")
	})

	it("leaves room for a numeric suffix", () => {
		const base = usernameBaseFromEmail(`${"a".repeat(40)}@gmail.com`, "A")
		expect(base.length).toBe(20)
	})
})

describe("resolveGoogleUser", () => {
	it("creates a verified, passwordless account with a generated username", async () => {
		const id = identity({ email: `fresh${Date.now()}@gmail.com` })
		const outcome = await resolveGoogleUser(id, flow(), null)

		expect(outcome.kind).toBe("signup")
		expect(outcome.user.username).toMatch(/^fresh\d+$/)
		expect(outcome.user.emailVerified).toBe(true)
		expect(outcome.user.passwordHash).toBeNull()

		const link = await db.query.oauthAccounts.findFirst({
			where: { providerUserId: id.sub },
		})
		expect(link?.userId).toBe(outcome.user.id)
	})

	it("adds a suffix when the username is already taken", async () => {
		const taken = await makeUser({ username: `taken${Date.now() % 100000}` })
		const outcome = await resolveGoogleUser(
			identity({ email: `${taken.username}@gmail.com` }),
			flow(),
			null,
		)

		expect(outcome.user.username).not.toBe(taken.username)
		expect(outcome.user.username).toMatch(
			new RegExp(`^${taken.username}\\d{4}$`),
		)
	})

	it("applies the invite code carried through the flow", async () => {
		const referrer = await makeUser()
		const code = await makeReferralCode(referrer.id)

		const outcome = await resolveGoogleUser(
			identity(),
			flow({ code: code.code, source: "invite_link" }),
			null,
		)

		expect(outcome.kind === "signup" && outcome.redoGranted).toBe(true)
		const referral = await db.query.referrals.findFirst({
			where: { inviteeId: outcome.user.id },
		})
		expect(referral?.referrerId).toBe(referrer.id)
		expect(await redoBalanceFor(outcome.user.id)).toBe(1)
	})

	it("signs a linked account straight back in", async () => {
		const id = identity()
		const first = await resolveGoogleUser(id, flow(), null)
		const second = await resolveGoogleUser(id, flow(), null)

		expect(second.kind).toBe("signin")
		expect(second.user.id).toBe(first.user.id)
	})

	it("links to a verified account with the same email and keeps its password", async () => {
		const existing = await makeUser({ email: `Linked${Date.now()}@Gmail.com` })
		const outcome = await resolveGoogleUser(
			identity({ email: existing.email.toLowerCase() }),
			flow(),
			null,
		)

		expect(outcome.kind).toBe("signin")
		expect(outcome.user.id).toBe(existing.id)
		expect(outcome.user.passwordHash).toBe(existing.passwordHash)
	})

	it("takes an unverified account away from whoever set its password", async () => {
		const existing = await makeUser({ emailVerified: false })
		await db.insert(sessions).values({
			userId: existing.id,
			expiresAt: new Date(Date.now() + 60_000),
		})

		const outcome = await resolveGoogleUser(
			identity({ email: existing.email }),
			flow(),
			null,
		)

		expect(outcome.user.id).toBe(existing.id)
		expect(outcome.user.emailVerified).toBe(true)
		expect(outcome.user.passwordHash).toBeNull()
		expect(
			await db.query.sessions.findFirst({ where: { userId: existing.id } }),
		).toBeUndefined()
	})
})
