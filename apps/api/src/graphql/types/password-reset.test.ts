import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../../db"
import { passwordResetTokens } from "../../db/schema"
import { sendMail } from "../../lib/mailer"
import { verifyPassword } from "../../lib/password"
import { hashResetToken, issuePasswordReset } from "../../lib/password-reset"
import { createSession } from "../../lib/session"
import { makeUser } from "../../test/factories"
import { expectData, testContext } from "../../test/graphql"

vi.mock("../../lib/mailer", () => ({
	sendMail: vi.fn(async () => ({ ok: true })),
}))

const REQUEST_RESET = /* GraphQL */ `
	mutation RequestPasswordReset($input: RequestPasswordResetInput!) {
		requestPasswordReset(input: $input) {
			__typename
			... on MutationRequestPasswordResetSuccess { data }
			... on ValidationError { fieldErrors { field message } }
		}
	}
`

const RESET = /* GraphQL */ `
	mutation ResetPassword($input: ResetPasswordInput!) {
		resetPassword(input: $input) {
			__typename
			... on AuthPayload { user { id } }
			... on ValidationError { fieldErrors { field message } }
		}
	}
`

type RequestResult = {
	requestPasswordReset: {
		__typename: string
		data?: boolean
		fieldErrors?: { field: string | null; message: string }[]
	}
}

type ResetResult = {
	resetPassword: {
		__typename: string
		user?: { id: string }
		fieldErrors?: { field: string | null; message: string }[]
	}
}

// The token as it appears in the emailed link.
function sentToken() {
	const text = vi.mocked(sendMail).mock.calls.at(-1)?.[0].text ?? ""
	return /token=([a-f0-9]+)/.exec(text)?.[1] ?? ""
}

async function seedToken(userId: string, expiresAt: Date) {
	const token = `token-${userId}`
	await db.insert(passwordResetTokens).values({
		userId,
		tokenHash: hashResetToken(token),
		expiresAt,
	})
	return token
}

beforeEach(() => {
	vi.mocked(sendMail).mockClear()
})

describe("requestPasswordReset", () => {
	it("answers the same for an unknown email and sends nothing", async () => {
		const data = await expectData<RequestResult>(REQUEST_RESET, {
			variables: { input: { email: "nobody@example.com" } },
		})
		expect(data.requestPasswordReset).toEqual({
			__typename: "MutationRequestPasswordResetSuccess",
			data: true,
		})

		await issuePasswordReset("nobody@example.com")
		expect(sendMail).not.toHaveBeenCalled()
	})

	it("rejects a malformed email", async () => {
		const data = await expectData<RequestResult>(REQUEST_RESET, {
			variables: { input: { email: "not-an-email" } },
		})
		expect(data.requestPasswordReset.__typename).toBe("ValidationError")
	})

	it("emails a link whose token is stored only as a hash", async () => {
		const user = await makeUser()
		await issuePasswordReset(user.email)

		expect(sendMail).toHaveBeenCalledOnce()
		expect(vi.mocked(sendMail).mock.calls[0]?.[0].to).toBe(user.email)
		const token = sentToken()
		expect(token).not.toBe("")

		const row = await db.query.passwordResetTokens.findFirst({
			where: { userId: user.id },
		})
		expect(row?.tokenHash).toBe(hashResetToken(token))
		expect(row?.tokenHash).not.toBe(token)
	})

	it("keeps the first link and sends nothing on a repeat inside the cooldown", async () => {
		const user = await makeUser()
		await issuePasswordReset(user.email)
		const first = sentToken()
		await issuePasswordReset(user.email)

		expect(sendMail).toHaveBeenCalledOnce()
		const row = await db.query.passwordResetTokens.findFirst({
			where: { userId: user.id },
		})
		expect(row?.tokenHash).toBe(hashResetToken(first))
	})
})

describe("resetPassword", () => {
	it("sets the password, spends the token, signs out every session and signs in", async () => {
		const user = await makeUser({ emailVerified: false })
		await createSession(user.id)
		await createSession(user.id)
		const token = await seedToken(user.id, new Date(Date.now() + 60_000))

		const context = testContext()
		const data = await expectData<ResetResult>(RESET, {
			variables: { input: { token, newPassword: "brand-new-pass" } },
			context,
		})
		expect(data.resetPassword.__typename).toBe("AuthPayload")

		const updated = await db.query.users.findFirst({ where: { id: user.id } })
		expect(
			await verifyPassword(updated?.passwordHash ?? "", "brand-new-pass"),
		).toBe(true)
		expect(updated?.emailVerified).toBe(true)

		// Only the session this reset just created is left.
		const remaining = await db.query.sessions.findMany({
			where: { userId: user.id },
		})
		expect(remaining).toHaveLength(1)
		expect(context.cookies.session).toBe(remaining[0]?.id)

		expect(
			await db.query.passwordResetTokens.findFirst({
				where: { userId: user.id },
			}),
		).toBeUndefined()
	})

	it("works once", async () => {
		const user = await makeUser()
		const token = await seedToken(user.id, new Date(Date.now() + 60_000))
		const input = { token, newPassword: "brand-new-pass" }

		await expectData<ResetResult>(RESET, { variables: { input } })
		const again = await expectData<ResetResult>(RESET, {
			variables: { input },
		})
		expect(again.resetPassword.__typename).toBe("ValidationError")
	})

	it("rejects an expired link and leaves the password alone", async () => {
		const user = await makeUser()
		const token = await seedToken(user.id, new Date(Date.now() - 1000))

		const data = await expectData<ResetResult>(RESET, {
			variables: { input: { token, newPassword: "brand-new-pass" } },
		})
		expect(data.resetPassword.__typename).toBe("ValidationError")

		const after = await db.query.users.findFirst({ where: { id: user.id } })
		expect(after?.passwordHash).toBe(user.passwordHash)
	})

	it("rejects an unknown token", async () => {
		const data = await expectData<ResetResult>(RESET, {
			variables: { input: { token: "nope", newPassword: "brand-new-pass" } },
		})
		expect(data.resetPassword.__typename).toBe("ValidationError")
	})

	it("rejects a short password before spending the token", async () => {
		const user = await makeUser()
		const token = await seedToken(user.id, new Date(Date.now() + 60_000))

		const data = await expectData<ResetResult>(RESET, {
			variables: { input: { token, newPassword: "short" } },
		})
		expect(data.resetPassword.fieldErrors?.[0]?.field).toBe("newPassword")
		expect(
			await db.query.passwordResetTokens.findFirst({
				where: { userId: user.id },
			}),
		).toBeDefined()
	})
})
