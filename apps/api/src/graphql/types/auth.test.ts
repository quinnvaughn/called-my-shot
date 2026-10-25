import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { redoBalanceFor } from "../../lib/redos"
import { makeLeague, makeReferralCode, makeUser } from "../../test/factories"
import { expectData } from "../../test/graphql"

const SIGN_UP = /* GraphQL */ `
	mutation SignUp($input: SignUpInput!) {
		signUp(input: $input) {
			__typename
			... on AuthPayload { redoGranted user { id username } }
			... on ValidationError { fieldErrors { field message } }
		}
	}
`

let n = 0
const newAccount = (extra: Record<string, unknown> = {}) => {
	const i = ++n
	return {
		name: `Invitee ${i}`,
		username: `invitee${i}${Date.now() % 100000}`,
		email: `invitee${i}${Date.now() % 100000}@example.com`,
		password: "password123",
		...extra,
	}
}

type SignUpResult = {
	signUp: {
		__typename: string
		redoGranted?: boolean
		user?: { id: string; username: string }
		fieldErrors?: { field: string | null; message: string }[]
	}
}

describe("signUp referral attribution", () => {
	it("records the referral and grants the invitee a welcome redo", async () => {
		const referrer = await makeUser()
		const code = await makeReferralCode(referrer.id)

		const data = await expectData<SignUpResult>(SIGN_UP, {
			variables: {
				input: newAccount({
					referralCode: code.code,
					referralSource: "INVITE_LINK",
				}),
			},
		})

		expect(data.signUp.__typename).toBe("AuthPayload")
		const inviteeId = data.signUp.user?.id ?? ""

		// What the signup toast fires on. Reported by the server because the
		// client can't tell a working code from a mistyped one.
		expect(data.signUp.redoGranted).toBe(true)

		const referral = await db.query.referrals.findFirst({
			where: { inviteeId },
		})
		expect(referral?.referrerId).toBe(referrer.id)
		expect(referral?.status).toBe("pending")
		expect(referral?.source).toBe("invite_link")

		// Both sides get one. The invitee's lands now, which is the reason
		// they used the link at all; the referrer's waits for a first call.
		expect(await redoBalanceFor(inviteeId)).toBe(1)
		expect(await redoBalanceFor(referrer.id)).toBe(0)
	})

	it("accepts a lowercase code, since people type these by hand", async () => {
		const referrer = await makeUser()
		const code = await makeReferralCode(referrer.id)

		const data = await expectData<SignUpResult>(SIGN_UP, {
			variables: {
				input: newAccount({
					referralCode: code.code.toLowerCase(),
					referralSource: "MANUAL_CODE",
				}),
			},
		})

		const referral = await db.query.referrals.findFirst({
			where: { inviteeId: data.signUp.user?.id ?? "" },
		})
		expect(referral?.referrerId).toBe(referrer.id)
		expect(referral?.source).toBe("manual_code")
	})

	it("still creates the account when the code is unknown", async () => {
		const data = await expectData<SignUpResult>(SIGN_UP, {
			variables: {
				input: newAccount({
					referralCode: "ZZZZZZ",
					referralSource: "MANUAL_CODE",
				}),
			},
		})

		// A mistyped code costs a redo nobody knew they were owed. It must not
		// cost someone their account, and it must not promise them a redo the
		// signup never granted.
		expect(data.signUp.__typename).toBe("AuthPayload")
		expect(data.signUp.redoGranted).toBe(false)
		const inviteeId = data.signUp.user?.id ?? ""
		expect(
			await db.query.referrals.findFirst({ where: { inviteeId } }),
		).toBeUndefined()
		expect(await redoBalanceFor(inviteeId)).toBe(0)
	})

	it("grants nothing to someone who signs up through the front door", async () => {
		const data = await expectData<SignUpResult>(SIGN_UP, {
			variables: { input: newAccount() },
		})

		// The redo is the link's benefit. Giving it to everyone would delete
		// the reason the link exists.
		expect(await redoBalanceFor(data.signUp.user?.id ?? "")).toBe(0)
	})
})

describe("signUp follows", () => {
	it("starts a new account following every active league", async () => {
		const active = await makeLeague()
		const inactive = await makeLeague({ status: "inactive" })
		const data = await expectData<SignUpResult>(SIGN_UP, {
			variables: { input: newAccount() },
		})

		const followed = await db.query.follows.findMany({
			where: { followerId: data.signUp.user?.id ?? "", targetKind: "league" },
		})
		const ids = followed.map((row) => row.targetId)
		expect(ids).toContain(active.id)
		expect(ids).not.toContain(inactive.id)
	})
})

describe("accounts made through Google", () => {
	const SIGN_IN = /* GraphQL */ `
		mutation SignIn($input: SignInInput!) {
			signIn(input: $input) {
				__typename
				... on ValidationError { fieldErrors { field message } }
			}
		}
	`

	it("can't be signed into with a password, and look like a wrong one", async () => {
		const user = await makeUser({ passwordHash: null })

		const data = await expectData<{
			signIn: { __typename: string; fieldErrors?: { message: string }[] }
		}>(SIGN_IN, {
			variables: { input: { identifier: user.email, password: "anything" } },
		})

		expect(data.signIn.__typename).toBe("ValidationError")
		expect(data.signIn.fieldErrors?.[0]?.message).toBe(
			"Invalid email/username or password",
		)
	})

	it("can set a first password without a current one", async () => {
		const user = await makeUser({ passwordHash: null })

		const data = await expectData<{
			updatePassword: { __typename: string; hasPassword?: boolean }
		}>(
			/* GraphQL */ `
				mutation SetPassword($input: UpdatePasswordInput!) {
					updatePassword(input: $input) {
						__typename
						... on User { hasPassword }
					}
				}
			`,
			{ as: user, variables: { input: { newPassword: "password123" } } },
		)

		expect(data.updatePassword.__typename).toBe("User")
		expect(data.updatePassword.hasPassword).toBe(true)
	})

	it("still needs the current password once one is set", async () => {
		const user = await makeUser()

		const data = await expectData<{
			updatePassword: {
				__typename: string
				fieldErrors?: { field: string | null }[]
			}
		}>(
			/* GraphQL */ `
				mutation SetPassword($input: UpdatePasswordInput!) {
					updatePassword(input: $input) {
						__typename
						... on ValidationError { fieldErrors { field } }
					}
				}
			`,
			{ as: user, variables: { input: { newPassword: "password123" } } },
		)

		expect(data.updatePassword.__typename).toBe("ValidationError")
		expect(data.updatePassword.fieldErrors?.[0]?.field).toBe(
			"currentPassword",
		)
	})
})
