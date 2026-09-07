import { describe, expect, it } from "vitest"
import { assertProductionConfig, env } from "./env"

// The production check deliberately lives in a function rather than in the
// env schema's parse. The web app's Dockerfile runs `pnpm --filter api
// schema:print` against a stub .env that sets NODE_ENV=production, so
// enforcing it at parse time broke that build - a missing mail secret is not
// something a frontend image build should discover.
describe("assertProductionConfig", () => {
	it("does nothing outside production", () => {
		// The suite runs with NODE_ENV=test (see vitest.config.ts) and no
		// EMAIL_UNSUBSCRIBE_SECRET, which is exactly the case that must pass.
		expect(env.NODE_ENV).toBe("test")
		expect(env.EMAIL_UNSUBSCRIBE_SECRET).toBeUndefined()
		expect(() => assertProductionConfig()).not.toThrow()
	})

	it("is not enforced while merely importing env", async () => {
		// Importing this module must never throw on its own - schema:print and
		// the drizzle config both do it without serving traffic.
		await expect(import("./env")).resolves.toBeDefined()
	})
})

describe("mail defaults", () => {
	// Both must sit on the one domain verified in Resend
	// (mail.calledmyshot.com); a default pointing anywhere else fails every
	// send with no local signal.
	it("send from the verified domain", () => {
		expect(env.EMAIL_FROM).toContain("@mail.calledmyshot.com")
		expect(env.EMAIL_FROM_NOTIFICATIONS).toContain("@mail.calledmyshot.com")
	})

	it("keep notification mail on a separate From address from auth mail", () => {
		expect(env.EMAIL_FROM_NOTIFICATIONS).not.toBe(env.EMAIL_FROM)
	})
})
