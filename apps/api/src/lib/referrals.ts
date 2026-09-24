import { REDO_BALANCE_CAP, REFERRAL_SEASON_CAP } from "@called-my-shot/scoring"
import { and, count, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { redoGrants, referralCodes, referrals, users } from "../db/schema"
import type { DbOrTx, Tx } from "../db/types"
import { enqueueAnalyticsEvents } from "./analytics-outbox"
import {
	isValidInviteCodeShape,
	normalizeInviteCode,
	withRetriedCode,
} from "./invite-codes"
import { createNotification } from "./notifications"
import { redoBalanceFor } from "./redos"

// Every user's invite link, created on first read so opening the invite
// screen always has something to show and accounts predating this need no
// backfill. Same shape as getOrCreateMemberInvite for groups.
export async function getOrCreateReferralCode(userId: string) {
	const existing = await db.query.referralCodes.findFirst({ where: { userId } })
	if (existing) return existing

	return withRetriedCode(async (code) => {
		const [row] = await db
			.insert(referralCodes)
			.values({ userId, code })
			.returning()
		return row
	})
}

export async function findUserByReferralCode(
	code: string,
	executor: DbOrTx = db,
) {
	const normalized = normalizeInviteCode(code)
	if (!isValidInviteCodeShape(normalized)) return null

	const row = await executor.query.referralCodes.findFirst({
		where: { code: normalized },
	})
	return row ?? null
}

// Attribution, written in signUp's own transaction alongside the new user.
//
// A bad or unknown code is silently ignored rather than failing the signup:
// someone mistyping a friend's code should still end up with an account, and
// the worst case is they lose a redo they never knew they were owed. Returns
// the referral so signUp can grant the invitee's welcome redo off it.
export async function recordReferralAtSignup(
	tx: Tx,
	invitee: { id: string; email: string },
	rawCode: string,
	source: "invite_link" | "manual_code",
	signupIp: string | null,
) {
	const codeRow = await findUserByReferralCode(rawCode, tx)
	if (!codeRow) return null
	// Self-referral. Nothing stops someone pasting their own link into their
	// own signup, and it costs nothing to refuse it here.
	if (codeRow.userId === invitee.id) return null

	const [referral] = await tx
		.insert(referrals)
		.values({
			referrerId: codeRow.userId,
			inviteeId: invitee.id,
			code: codeRow.code,
			source,
			signupIp,
		})
		.returning()
	if (!referral) return null

	await enqueueAnalyticsEvents(tx, [
		{
			event: "referral_signup",
			userId: invitee.id,
			properties: { referrerId: codeRow.userId, source },
		},
	])
	return referral
}

// A referral qualifies on the invitee's FIRST call, not on its resolution -
// people want the redo for a game starting in an hour, and a season-long
// question can take months to settle.
//
// "First call" is enforced by the status transition, not by counting calls.
// referrals.invitee_id is unique and status only ever leaves 'pending' once,
// so a second call's UPDATE matches zero rows and this is idempotent for
// free. Counting would be both a scan and wrong: a voided or deleted call
// could take the count back to 1 and re-fire.
//
// For the overwhelming majority of callers, who were never referred, this is
// a single probe of a unique index that matches nothing.
export async function qualifyReferralOnFirstCall(
	tx: Tx,
	inviteeId: string,
	call: { id: string; seasonId: string },
) {
	const invitee = await tx.query.users.findFirst({
		where: { id: inviteeId },
		columns: { emailVerified: true },
	})

	const [referral] = await tx
		.update(referrals)
		.set({
			status: "qualified",
			qualifiedAt: new Date(),
			firstCallId: call.id,
			seasonId: call.seasonId,
			// Recorded, not enforced. Qualifying is deliberately instant, so
			// this is the column that makes a farm of throwaway accounts
			// visible in the abuse review rather than a gate that would put an
			// email round-trip between a friend calling and the redo landing.
			inviteeVerifiedAtQualify: invitee?.emailVerified ?? false,
		})
		.where(
			and(eq(referrals.inviteeId, inviteeId), eq(referrals.status, "pending")),
		)
		.returning()
	if (!referral) return null

	const qualified = {
		inviteeId,
		seasonId: call.seasonId,
		hoursFromSignup: hoursBetween(referral.createdAt, new Date()),
		inviteeEmailVerified: invitee?.emailVerified ?? false,
	}

	if (await isOverSeasonCap(tx, referral.referrerId, call.seasonId)) {
		await tx
			.update(referrals)
			.set({ status: "rejected" })
			.where(eq(referrals.id, referral.id))
		await enqueueAnalyticsEvents(tx, [
			{
				event: "referral_qualified",
				userId: referral.referrerId,
				properties: { ...qualified, outcome: "rejected_season_cap" },
			},
		])
		return null
	}

	// Locks the REFERRER's row, which is the same lock redoCall takes on its
	// own actor before touching redo_grants. One consistent order, so a redo
	// and an inbound referral can't deadlock each other.
	await tx
		.select()
		.from(users)
		.where(eq(users.id, referral.referrerId))
		.for("update")

	if ((await redoBalanceFor(referral.referrerId, tx)) >= REDO_BALANCE_CAP) {
		// Wallet full. The referral stays 'qualified' and waits in the queue
		// releaseWaitingReferral drains the next time they spend one, so
		// inviting people while full banks the credit rather than wasting it.
		await enqueueAnalyticsEvents(tx, [
			{
				event: "referral_qualified",
				userId: referral.referrerId,
				properties: { ...qualified, outcome: "queued" },
			},
		])
		return null
	}

	const grant = await grantReferralRedo(tx, referral)
	await enqueueAnalyticsEvents(tx, [
		{
			event: "referral_qualified",
			userId: referral.referrerId,
			properties: { ...qualified, outcome: "granted" },
		},
	])
	return grant
}

export type ReferralStats = {
	// Accounts created through this user's code, whatever came of them.
	invited: number
	// Of those, the ones who went on to make a call. This is the number the
	// invite screen leads with, since it's the one that earned anything.
	called: number
	// Redos earned but not yet handed over, because the wallet was full when
	// they qualified. Released one at a time as redos are spent.
	waiting: number
}

export async function referralStatsFor(
	referrerId: string,
	executor: DbOrTx = db,
): Promise<ReferralStats> {
	const rows = await executor
		.select({ status: referrals.status, n: count() })
		.from(referrals)
		.where(eq(referrals.referrerId, referrerId))
		.groupBy(referrals.status)

	const by = (status: (typeof referrals.status.enumValues)[number]) =>
		rows.find((r) => r.status === status)?.n ?? 0

	return {
		invited: rows.reduce((sum, r) => sum + r.n, 0),
		called: by("qualified") + by("granted"),
		waiting: by("qualified"),
	}
}

function hoursBetween(from: Date, to: Date): number {
	return Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 100) / 100
}

// Spending a redo is the only thing that frees wallet capacity, so it is the
// only place a referral that qualified while the wallet was full gets its
// grant. Runs inside redoCall's transaction, after the spend, under the
// users-row lock it already holds - so the count read here can't move under
// it.
//
// Grants at most one per spend on purpose: the cap is on unspent grants, and
// one spend freed exactly one slot. A referrer sitting on five qualified
// referrals drains them one redo at a time rather than in a burst. It goes
// through grantReferralRedo like any other, so a credit that waited still
// announces itself when it finally lands.
export async function releaseWaitingReferral(tx: Tx, userId: string) {
	if ((await redoBalanceFor(userId, tx)) >= REDO_BALANCE_CAP) return null

	const waiting = await tx.query.referrals.findFirst({
		where: { referrerId: userId, status: "qualified" },
		orderBy: { qualifiedAt: "asc" },
	})
	if (!waiting) return null

	return grantReferralRedo(tx, waiting)
}

async function isOverSeasonCap(
	tx: Tx,
	referrerId: string,
	seasonId: string,
): Promise<boolean> {
	const [row] = await tx
		.select({ n: count() })
		.from(referrals)
		.where(
			and(
				eq(referrals.referrerId, referrerId),
				eq(referrals.seasonId, seasonId),
				inArray(referrals.status, ["qualified", "granted"]),
			),
		)
	return (row?.n ?? 0) > REFERRAL_SEASON_CAP
}

// The referrer's side: a grant, and the notification that tells them it
// landed. They need one because this happens whenever their invitee happens
// to call, with nothing on their screen at the time. The invitee's own
// welcome redo is granted during signup instead, where a toast tells them
// on the spot - see AuthPayload.redoGranted.
export async function grantReferralRedo(
	tx: Tx,
	referral: { id: string; referrerId: string; inviteeId: string },
) {
	const [grant] = await tx
		.insert(redoGrants)
		.values({
			userId: referral.referrerId,
			source: "referral",
			referralId: referral.id,
		})
		.returning()

	await tx
		.update(referrals)
		.set({ status: "granted" })
		.where(eq(referrals.id, referral.id))

	const invitee = await tx.query.users.findFirst({
		where: { id: referral.inviteeId },
		columns: { username: true },
	})
	if (invitee) {
		await createNotification(tx, {
			type: "redo_earned",
			userId: referral.referrerId,
			actorId: referral.inviteeId,
			actorUsername: invitee.username,
		})
	}

	await enqueueAnalyticsEvents(tx, [
		{
			event: "redo_granted",
			userId: referral.referrerId,
			properties: {
				source: "referral",
				balanceAfter: await redoBalanceFor(referral.referrerId, tx),
			},
		},
	])

	return grant
}
