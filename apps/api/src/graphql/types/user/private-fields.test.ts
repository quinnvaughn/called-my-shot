import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { pendingEmailChanges } from "../../../db/schema"
import { hashPassword } from "../../../lib/password"
import { futureDate, makeAdmin, makeUser } from "../../../test/factories"
import { expectData } from "../../../test/graphql"

// User is returned on public surfaces (leaderboards, call records,
// notification actors), so its private fields have to gate per viewer rather
// than per query.

const PROFILE = /* GraphQL */ `
	query ($username: String!) {
		userByUsername(username: $username) {
			email
			emailBouncedAt
			mutedEmailTypes
			pendingEmailChange { newEmail }
		}
	}
`

type Profile = {
	userByUsername: {
		email: string | null
		emailBouncedAt: string | null
		mutedEmailTypes: string[] | null
		pendingEmailChange: { newEmail: string } | null
	}
}

async function makeSubject() {
	const user = await makeUser({ emailBouncedAt: new Date() })
	await db.insert(pendingEmailChanges).values({
		userId: user.id,
		newEmail: `new-${user.email}`,
		token: `token-${user.id}`,
		expiresAt: futureDate(),
	})
	return user
}

describe("User private fields", () => {
	it("are null for an anonymous viewer", async () => {
		const subject = await makeSubject()
		const data = await expectData<Profile>(PROFILE, {
			variables: { username: subject.username },
		})
		expect(data.userByUsername).toEqual({
			email: null,
			emailBouncedAt: null,
			mutedEmailTypes: null,
			pendingEmailChange: null,
		})
	})

	it("are null for another signed-in user", async () => {
		const subject = await makeSubject()
		const data = await expectData<Profile>(PROFILE, {
			as: await makeUser(),
			variables: { username: subject.username },
		})
		expect(data.userByUsername.email).toBeNull()
		expect(data.userByUsername.pendingEmailChange).toBeNull()
	})

	it("resolve for the user themselves", async () => {
		const subject = await makeSubject()
		const data = await expectData<Profile>(PROFILE, {
			as: subject,
			variables: { username: subject.username },
		})
		expect(data.userByUsername.email).toBe(subject.email)
		expect(data.userByUsername.emailBouncedAt).not.toBeNull()
		expect(data.userByUsername.mutedEmailTypes).toEqual([])
		expect(data.userByUsername.pendingEmailChange?.newEmail).toBe(
			`new-${subject.email}`,
		)
	})

	it("resolve for an admin", async () => {
		const subject = await makeSubject()
		const data = await expectData<Profile>(PROFILE, {
			as: await makeAdmin(),
			variables: { username: subject.username },
		})
		expect(data.userByUsername.email).toBe(subject.email)
	})

	it("resolve on the user signIn returns, before any session is read", async () => {
		const user = await makeUser({
			passwordHash: await hashPassword("correct horse"),
		})
		const data = await expectData<{
			signIn: { user?: { email: string | null } }
		}>(
			/* GraphQL */ `
				mutation ($input: SignInInput!) {
					signIn(input: $input) {
						... on AuthPayload { user { email } }
					}
				}
			`,
			{
				variables: {
					input: { identifier: user.username, password: "correct horse" },
				},
			},
		)
		expect(data.signIn.user?.email).toBe(user.email)
	})

	it("resolve on the user confirmEmailChange returns to a signed-out token holder", async () => {
		const subject = await makeSubject()
		const data = await expectData<{
			confirmEmailChange: { email?: string | null }
		}>(
			/* GraphQL */ `
				mutation ($token: String!) {
					confirmEmailChange(token: $token) {
						... on User { email }
					}
				}
			`,
			{ variables: { token: `token-${subject.id}` } },
		)
		expect(data.confirmEmailChange.email).toBe(`new-${subject.email}`)
	})
})
