import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { emailOptOuts, users } from "../db/schema"
import { makeUser } from "../test/factories"
import {
	clearEmailBounce,
	recordEmailBounce,
	recordSpamComplaint,
} from "./email-bounce"

async function reload(userId: string) {
	const user = await db.query.users.findFirst({ where: { id: userId } })
	if (!user) throw new Error("user vanished")
	return user
}

describe("recordEmailBounce", () => {
	it("flags the account that owns the address", async () => {
		const user = await makeUser()
		await recordEmailBounce(user.email, "mailbox does not exist")

		const updated = await reload(user.id)
		expect(updated.emailBouncedAt).not.toBeNull()
		expect(updated.emailBounceReason).toBe("mailbox does not exist")
	})

	it("leaves other accounts alone", async () => {
		const bounced = await makeUser()
		const fine = await makeUser()
		await recordEmailBounce(bounced.email, null)

		expect((await reload(fine.id)).emailBouncedAt).toBeNull()
	})

	it("ignores an address nobody owns", async () => {
		await expect(
			recordEmailBounce("nobody@example.com", null),
		).resolves.toBeUndefined()
	})

	// Nothing about sending is gated on this flag - it only drives the banner.
	// Asserted so a later "don't waste sends on a bounced address" change has
	// to be a deliberate decision rather than a quiet one.
	it("does not mute anything", async () => {
		const user = await makeUser()
		await recordEmailBounce(user.email, null)

		const optOuts = await db
			.select()
			.from(emailOptOuts)
			.where(eq(emailOptOuts.userId, user.id))
		expect(optOuts).toHaveLength(0)
	})
})

describe("recordSpamComplaint", () => {
	it("mutes everything for the complainer", async () => {
		const user = await makeUser()
		await recordSpamComplaint(user.email)

		const optOuts = await db
			.select()
			.from(emailOptOuts)
			.where(eq(emailOptOuts.userId, user.id))
		expect(optOuts.map((o) => o.type)).toEqual(["all"])
	})

	// Their address works fine - they just don't want the mail.
	it("does not flag the address as bouncing", async () => {
		const user = await makeUser()
		await recordSpamComplaint(user.email)
		expect((await reload(user.id)).emailBouncedAt).toBeNull()
	})

	it("is idempotent across repeat complaints", async () => {
		const user = await makeUser()
		await recordSpamComplaint(user.email)
		await recordSpamComplaint(user.email)

		const optOuts = await db
			.select()
			.from(emailOptOuts)
			.where(eq(emailOptOuts.userId, user.id))
		expect(optOuts).toHaveLength(1)
	})
})

describe("clearEmailBounce", () => {
	it("takes the banner down once the address is fixed", async () => {
		const user = await makeUser()
		await recordEmailBounce(user.email, "mailbox full")
		await clearEmailBounce(user.id)

		const updated = await reload(user.id)
		expect(updated.emailBouncedAt).toBeNull()
		expect(updated.emailBounceReason).toBeNull()
	})
})

describe("a bounced address still gets mail", () => {
	// The digest deliberately doesn't check this flag: the address may have
	// been fixed at the provider, and the only way to find out is to keep
	// sending. Suppression is Resend's job, not a column here.
	it("leaves the user otherwise untouched", async () => {
		const user = await makeUser()
		await recordEmailBounce(user.email, null)

		const updated = await reload(user.id)
		expect(updated.email).toBe(user.email)
		expect(updated.emailVerified).toBe(user.emailVerified)
	})
})

describe("users schema", () => {
	it("starts every account with no bounce", async () => {
		const user = await makeUser()
		const [row] = await db.select().from(users).where(eq(users.id, user.id))
		expect(row.emailBouncedAt).toBeNull()
		expect(row.emailBounceReason).toBeNull()
	})
})
