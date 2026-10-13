import {
	type ReportGloatInput,
	reportGloatSchema,
	type SendGloatInput,
	sendGloatSchema,
} from "@called-my-shot/schemas"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../db"
import {
	challengeAcceptances,
	challenges,
	type Gloat,
	type GloatReport,
	gloatReports,
	gloats,
	type User,
} from "../../db/schema"
import type { Tx } from "../../db/types"
import { enqueueAnalyticsEvents } from "../analytics-outbox"
import { NotFoundError, ValidationError } from "../errors"
import { registerGifShare, reportGifToKlipy } from "../gifs/klipy"
import type { Strictness } from "../moderation"
import { assertAllowedText } from "../moderation/guard"
import { createNotifications } from "../notifications"
import { isBlockedEitherWay, sharesGroup } from "../pressers/ask"
import { loadChallengeQuestionFacts } from "./load"
import {
	buildMatchups,
	challengeState,
	loadChallengePoints,
	type Matchup,
} from "./outcome"

type ChallengeAcceptance = typeof challengeAcceptances.$inferSelect

// The 1v1s in a challenge as they stand, read inside the caller's
// transaction.
async function matchupsIn(
	tx: Tx,
	challenge: { id: string; creatorId: string },
) {
	const facts =
		(await loadChallengeQuestionFacts([challenge.id], tx)).get(challenge.id) ??
		[]
	const acceptances = await tx.query.challengeAcceptances.findMany({
		where: { challengeId: challenge.id },
	})
	const state = challengeState(facts)
	const pointsOf = await loadChallengePoints(
		[challenge.id],
		[challenge.creatorId, ...acceptances.map((a) => a.acceptorId)],
		tx,
	)
	return {
		state,
		matchups: buildMatchups({
			challengeId: challenge.id,
			creatorId: challenge.creatorId,
			state,
			acceptances,
			pointsOf,
		}),
	}
}

// Who a gloat from `viewer` would go to, or why it can't be sent: the
// creator's goes to everyone they beat, an acceptor's to the creator if they
// beat them. Only once the challenge has settled.
async function gloatTargets(
	tx: Tx,
	viewer: { id: string },
	challenge: { id: string; creatorId: string },
): Promise<
	| {
			ok: true
			acceptance: ChallengeAcceptance | null
			beaten: Matchup<ChallengeAcceptance>[]
	  }
	| { ok: false; reason: string }
> {
	const { state, matchups } = await matchupsIn(tx, challenge)
	if (state !== "settled") {
		return {
			ok: false,
			reason: "You can talk trash once the challenge is over.",
		}
	}
	if (viewer.id === challenge.creatorId) {
		const beaten = matchups.filter((m) => m.outcome === "creator")
		return beaten.length > 0
			? { ok: true, acceptance: null, beaten }
			: { ok: false, reason: "You didn't beat anyone in this one." }
	}
	const mine = matchups.find((m) => m.acceptance.acceptorId === viewer.id)
	if (!mine) return { ok: false, reason: "You're not in this challenge." }
	return mine.outcome === "acceptor"
		? { ok: true, acceptance: mine.acceptance, beaten: [mine] }
		: { ok: false, reason: "Only the winner of a 1v1 can talk trash." }
}

// Whether `viewer` has a gloat to send on this challenge right now.
export async function canGloat(
	viewer: { id: string },
	challenge: { id: string; creatorId: string },
): Promise<boolean> {
	return db.transaction(async (tx) => {
		const targets = await gloatTargets(tx, viewer, challenge)
		if (!targets.ok) return false
		const sent = await tx.query.gloats.findFirst({
			where: {
				challengeId: challenge.id,
				senderId: viewer.id,
				acceptanceId: targets.acceptance
					? targets.acceptance.id
					: { isNull: true },
			},
			columns: { id: true },
		})
		return !sent
	})
}

// A winner's one gloat on a challenge: their own words, a GIF, or both.
export async function sendChallengeGloat(
	sender: User,
	challengeId: string,
	input: SendGloatInput,
): Promise<Gloat> {
	const parsed = sendGloatSchema.safeParse(input)
	if (!parsed.success) throw ValidationError.fromZodIssues(parsed.error.issues)
	const { text, gif } = parsed.data

	const challenge = await db.query.challenges.findFirst({
		where: { id: challengeId },
	})
	if (!challenge) throw new NotFoundError("That challenge doesn't exist.")

	// The creator's goes to people who may share nothing with them; an
	// acceptor's goes to one person, judged the way a presser question is.
	if (text.length > 0) {
		const strictness: Strictness =
			sender.id !== challenge.creatorId &&
			(await sharesGroup(db, sender.id, challenge.creatorId))
				? "standard"
				: "strict"
		await assertAllowedText(text, "text", strictness, (category) => ({
			event: "gloat_text_blocked",
			userId: sender.id,
			properties: { category, strictness },
		}))
	}

	const gloat = await db.transaction(async (tx) => {
		await tx
			.select({ id: challenges.id })
			.from(challenges)
			.where(eq(challenges.id, challenge.id))
			.for("update")
		const targets = await gloatTargets(tx, sender, challenge)
		if (!targets.ok) throw ValidationError.field(null, targets.reason)
		if (
			targets.acceptance &&
			(await isBlockedEitherWay(tx, sender.id, challenge.creatorId))
		) {
			throw ValidationError.field(null, "You can't send this one.")
		}

		// The row lock above makes this check safe against a second send.
		const sent = await tx.query.gloats.findFirst({
			where: {
				challengeId: challenge.id,
				senderId: sender.id,
				acceptanceId: targets.acceptance
					? targets.acceptance.id
					: { isNull: true },
			},
			columns: { id: true },
		})
		if (sent) {
			throw ValidationError.field(
				null,
				"You've already talked trash on this one.",
			)
		}
		const [row] = await tx
			.insert(gloats)
			.values({
				senderId: sender.id,
				source: targets.acceptance ? "challenge_acceptor" : "challenge_creator",
				challengeId: challenge.id,
				acceptanceId: targets.acceptance?.id ?? null,
				text: text.length > 0 ? text : null,
				gifProvider: gif ? "klipy" : null,
				gifId: gif?.id ?? null,
				gifUrl: gif?.url ?? null,
				gifWidth: gif?.width ?? null,
				gifHeight: gif?.height ?? null,
				gifAlt: gif?.alt || null,
			})
			.returning()

		const recipientIds = targets.acceptance
			? [challenge.creatorId]
			: targets.beaten.map((m) => m.acceptance.acceptorId)
		if (!targets.acceptance) {
			await tx
				.update(challengeAcceptances)
				.set({ creatorGloatSentAt: new Date() })
				.where(
					inArray(
						challengeAcceptances.id,
						targets.beaten.map((m) => m.acceptance.id),
					),
				)
		}
		const unblocked = []
		for (const userId of recipientIds) {
			if (!(await isBlockedEitherWay(tx, sender.id, userId))) {
				unblocked.push(userId)
			}
		}
		await createNotifications(
			tx,
			unblocked.map((userId) => ({
				type: "challenge_gloated" as const,
				userId,
				challengeId: challenge.id,
				actorId: sender.id,
				actorUsername: sender.username,
			})),
		)
		return row
	})

	if (gif) registerGifShare(gif.id, sender.id)
	return gloat
}

// Anyone signed in can report a gloat, once. Reports wait for an admin;
// nothing comes down on its own.
export async function reportGloat(
	reporter: User,
	input: ReportGloatInput,
): Promise<GloatReport> {
	const parsed = reportGloatSchema.safeParse(input)
	if (!parsed.success) throw ValidationError.fromZodIssues(parsed.error.issues)
	const gloat = await db.query.gloats.findFirst({
		where: { id: parsed.data.gloatId },
	})
	if (!gloat || gloat.removedAt) throw new NotFoundError("Trash talk not found")
	if (gloat.senderId === reporter.id) {
		throw ValidationError.field(null, "You can't report your own trash talk.")
	}

	const report = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(gloatReports)
			.values({
				reporterId: reporter.id,
				gloatId: gloat.id,
				reason: parsed.data.reason,
				details: parsed.data.details || null,
			})
			.onConflictDoNothing()
			.returning()
		if (!row) throw ValidationError.field(null, "You've already reported this.")
		await enqueueAnalyticsEvents(tx, [
			{
				event: "gloat_reported",
				userId: reporter.id,
				properties: { gloatId: gloat.id, reason: parsed.data.reason },
			},
		])
		return row
	})
	if (gloat.gifId)
		reportGifToKlipy(gloat.gifId, reporter.id, parsed.data.reason)
	return report
}

export async function dismissGloatReport(
	admin: User,
	reportId: string,
	now = new Date(),
): Promise<GloatReport> {
	const [report] = await db
		.update(gloatReports)
		.set({ status: "dismissed", reviewedAt: now, reviewedByAdminId: admin.id })
		.where(and(eq(gloatReports.id, reportId), eq(gloatReports.status, "open")))
		.returning()
	if (!report) throw new NotFoundError("Report not found")
	return report
}

// Takes the reported gloat down, closing every open report on it. The
// content stays on the row for the report's record.
export async function removeGloat(
	admin: User,
	reportId: string,
	now = new Date(),
): Promise<GloatReport> {
	return db.transaction(async (tx) => {
		const report = await tx.query.gloatReports.findFirst({
			where: { id: reportId },
		})
		if (!report) throw new NotFoundError("Report not found")
		await tx
			.update(gloats)
			.set({ removedAt: now })
			.where(and(eq(gloats.id, report.gloatId), isNull(gloats.removedAt)))
		await tx
			.update(gloatReports)
			.set({ status: "removed", reviewedAt: now, reviewedByAdminId: admin.id })
			.where(
				and(
					eq(gloatReports.gloatId, report.gloatId),
					eq(gloatReports.status, "open"),
				),
			)
		const updated = await tx.query.gloatReports.findFirst({
			where: { id: reportId },
		})
		if (!updated) throw new NotFoundError("Report not found")
		return updated
	})
}
