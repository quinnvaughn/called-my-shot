import { describe, expect, it } from "vitest"
import { db } from "../db"
import { pushSubscriptions, sessions } from "../db/schema"
import { futureDate, makeUser } from "../test/factories"
import { type ErrorResult, execute, testContext } from "../test/graphql"
import { isAllowedPushEndpoint } from "./push-subscriptions"

const SAVE = `
	mutation Save($input: SavePushSubscriptionInput!) {
		savePushSubscription(input: $input) {
			__typename
			... on ValidationError { message }
		}
	}
`

async function signedIn() {
	const user = await makeUser()
	const [session] = await db
		.insert(sessions)
		.values({ userId: user.id, expiresAt: futureDate(24) })
		.returning()
	return { user, context: { ...testContext(user), sessionId: session.id } }
}

const input = (endpoint: string) => ({
	endpoint,
	p256dh: "key",
	auth: "secret",
	platform: "IOS",
	standalone: true,
})

describe("isAllowedPushEndpoint", () => {
	it.each([
		["https://fcm.googleapis.com/fcm/send/abc", true],
		["https://web.push.apple.com/QGz", true],
		["https://updates.push.services.mozilla.com/wpush/v2/abc", true],
		["https://db5p.notify.windows.com/w/?token=abc", true],
		["http://fcm.googleapis.com/fcm/send/abc", false],
		["https://fcm.googleapis.com:8443/fcm/send/abc", false],
		["https://evil.example.com/fcm.googleapis.com", false],
		["https://169.254.169.254/latest/meta-data", false],
		["not a url", false],
	])("%s -> %s", (endpoint, allowed) => {
		expect(isAllowedPushEndpoint(endpoint)).toBe(allowed)
	})
})

describe("savePushSubscription", () => {
	it("saves the device under the caller's session", async () => {
		const { user, context } = await signedIn()

		const result = await execute(SAVE, {
			context,
			variables: { input: input("https://web.push.apple.com/device") },
		})

		expect(result.data?.savePushSubscription).toEqual({ __typename: "User" })
		const [row] = await db.select().from(pushSubscriptions)
		expect(row).toMatchObject({
			userId: user.id,
			sessionId: context.sessionId,
			platform: "ios",
			standalone: true,
		})
	})

	it("moves a browser's endpoint to whoever saves it next", async () => {
		const first = await signedIn()
		const second = await signedIn()
		const variables = { input: input("https://web.push.apple.com/shared") }

		await execute(SAVE, { context: first.context, variables })
		await execute(SAVE, { context: second.context, variables })

		const rows = await db.select().from(pushSubscriptions)
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			userId: second.user.id,
			sessionId: second.context.sessionId,
		})
	})

	it("refuses an endpoint that isn't a push service", async () => {
		const { context } = await signedIn()

		const result = await execute(SAVE, {
			context,
			variables: { input: input("https://example.com/hook") },
		})

		expect((result.data?.savePushSubscription as ErrorResult).__typename).toBe(
			"ValidationError",
		)
		expect(await db.select().from(pushSubscriptions)).toHaveLength(0)
	})

	it("is removed with the session it was saved under", async () => {
		const { context } = await signedIn()
		await execute(SAVE, {
			context,
			variables: { input: input("https://web.push.apple.com/device") },
		})

		await db.delete(sessions)

		expect(await db.select().from(pushSubscriptions)).toHaveLength(0)
	})
})
