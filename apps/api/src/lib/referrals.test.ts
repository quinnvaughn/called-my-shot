import { REDO_BALANCE_CAP } from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import {
	makeCall,
	makeQuestion,
	makeRedoGrant,
	makeReferral,
	makeReferralCode,
	makeUser,
} from "../test/factories"
import { redoBalanceFor } from "./redos"
import {
	qualifyReferralOnFirstCall,
	referralStatsFor,
	releaseWaitingReferral,
} from "./referrals"

// The referral helpers all take a transaction, since they run inside
// castCall's and redoCall's. Tests drive them the same way.
function inTx<T>(fn: Parameters<typeof db.transaction<T>>[0]) {
	return db.transaction(fn)
}

async function seedPendingReferral() {
	const referrer = await makeUser()
	const invitee = await makeUser()
	await makeReferralCode(referrer.id)
	const referral = await makeReferral(referrer.id, invitee.id)
	const question = await makeQuestion()
	const call = await makeCall(question.id, invitee.id)
	return { referrer, invitee, referral, question, call }
}

describe("qualifyReferralOnFirstCall", () => {
	it("grants the referrer a redo on the invitee's first call", async () => {
		const { referrer, invitee, question, call } = await seedPendingReferral()

		await inTx((tx) =>
			qualifyReferralOnFirstCall(tx, invitee.id, {
				id: call.id,
				seasonId: question.seasonId,
			}),
		)

		expect(await redoBalanceFor(referrer.id)).toBe(1)
		const row = await db.query.referrals.findFirst({
			where: { inviteeId: invitee.id },
		})
		expect(row?.status).toBe("granted")
		expect(row?.firstCallId).toBe(call.id)
	})

	it("notifies the referrer", async () => {
		const { referrer, invitee, question, call } = await seedPendingReferral()

		await inTx((tx) =>
			qualifyReferralOnFirstCall(tx, invitee.id, {
				id: call.id,
				seasonId: question.seasonId,
			}),
		)

		const notifications = await db.query.notifications.findMany({
			where: { userId: referrer.id },
		})
		expect(notifications).toHaveLength(1)
		expect(notifications[0].type).toBe("redo_earned")
		expect(notifications[0].actorUsername).toBe(invitee.username)
	})

	it("does not re-fire on a second call", async () => {
		const { referrer, invitee, question, call } = await seedPendingReferral()
		const second = await makeCall((await makeQuestion()).id, invitee.id)

		await inTx((tx) =>
			qualifyReferralOnFirstCall(tx, invitee.id, {
				id: call.id,
				seasonId: question.seasonId,
			}),
		)
		await inTx((tx) =>
			qualifyReferralOnFirstCall(tx, invitee.id, {
				id: second.id,
				seasonId: question.seasonId,
			}),
		)

		// The status transition is the idempotency: it only leaves 'pending'
		// once, so a second call matches zero rows.
		expect(await redoBalanceFor(referrer.id)).toBe(1)
	})

	it("is a no-op for a caller who was never referred", async () => {
		const user = await makeUser()
		const question = await makeQuestion()
		const call = await makeCall(question.id, user.id)

		const granted = await inTx((tx) =>
			qualifyReferralOnFirstCall(tx, user.id, {
				id: call.id,
				seasonId: question.seasonId,
			}),
		)

		expect(granted).toBeNull()
		expect(await redoBalanceFor(user.id)).toBe(0)
	})

	it("queues the credit instead of wasting it when the wallet is full", async () => {
		const { referrer, invitee, question, call } = await seedPendingReferral()
		for (let i = 0; i < REDO_BALANCE_CAP; i++) {
			await makeRedoGrant(referrer.id)
		}

		await inTx((tx) =>
			qualifyReferralOnFirstCall(tx, invitee.id, {
				id: call.id,
				seasonId: question.seasonId,
			}),
		)

		expect(await redoBalanceFor(referrer.id)).toBe(REDO_BALANCE_CAP)
		const row = await db.query.referrals.findFirst({
			where: { inviteeId: invitee.id },
		})
		// Held, not lost - releaseWaitingReferral hands it over on the next spend.
		expect(row?.status).toBe("qualified")
		expect(row?.qualifiedAt).not.toBeNull()
	})
})

describe("releaseWaitingReferral", () => {
	it("grants one waiting credit when capacity frees up", async () => {
		const referrer = await makeUser()
		const [a, b] = [await makeUser(), await makeUser()]
		await makeReferral(referrer.id, a.id, {
			status: "qualified",
			qualifiedAt: new Date(Date.now() - 60_000),
		})
		await makeReferral(referrer.id, b.id, {
			status: "qualified",
			qualifiedAt: new Date(),
		})

		await inTx((tx) => releaseWaitingReferral(tx, referrer.id))

		expect(await redoBalanceFor(referrer.id)).toBe(1)
		// Oldest first.
		const first = await db.query.referrals.findFirst({
			where: { inviteeId: a.id },
		})
		const second = await db.query.referrals.findFirst({
			where: { inviteeId: b.id },
		})
		expect(first?.status).toBe("granted")
		expect(second?.status).toBe("qualified")
	})

	it("grants at most one per spend", async () => {
		const referrer = await makeUser()
		for (let i = 0; i < 4; i++) {
			await makeReferral(referrer.id, (await makeUser()).id, {
				status: "qualified",
				qualifiedAt: new Date(),
			})
		}

		await inTx((tx) => releaseWaitingReferral(tx, referrer.id))

		// One spend freed exactly one slot, so a backlog drains one redo at a
		// time rather than in a burst.
		expect(await redoBalanceFor(referrer.id)).toBe(1)
	})

	it("does nothing when the wallet is already at cap", async () => {
		const referrer = await makeUser()
		for (let i = 0; i < REDO_BALANCE_CAP; i++) {
			await makeRedoGrant(referrer.id)
		}
		await makeReferral(referrer.id, (await makeUser()).id, {
			status: "qualified",
			qualifiedAt: new Date(),
		})

		const granted = await inTx((tx) => releaseWaitingReferral(tx, referrer.id))

		expect(granted).toBeNull()
		expect(await redoBalanceFor(referrer.id)).toBe(REDO_BALANCE_CAP)
	})

	it("does nothing when nothing is waiting", async () => {
		const referrer = await makeUser()

		const granted = await inTx((tx) => releaseWaitingReferral(tx, referrer.id))

		expect(granted).toBeNull()
		expect(await redoBalanceFor(referrer.id)).toBe(0)
	})
})

describe("referralStatsFor", () => {
	it("counts invited, called and waiting separately", async () => {
		const referrer = await makeUser()
		// Signed up, never called.
		await makeReferral(referrer.id, (await makeUser()).id)
		// Called, credit already handed over.
		await makeReferral(referrer.id, (await makeUser()).id, {
			status: "granted",
			qualifiedAt: new Date(),
		})
		// Called, credit held back by the cap.
		await makeReferral(referrer.id, (await makeUser()).id, {
			status: "qualified",
			qualifiedAt: new Date(),
		})

		const stats = await referralStatsFor(referrer.id)

		expect(stats).toEqual({ invited: 3, called: 2, waiting: 1 })
	})

	it("is all zeroes for someone who has invited nobody", async () => {
		const user = await makeUser()
		expect(await referralStatsFor(user.id)).toEqual({
			invited: 0,
			called: 0,
			waiting: 0,
		})
	})
})
