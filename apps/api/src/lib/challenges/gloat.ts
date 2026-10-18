import type { CommentInput } from "@called-my-shot/schemas"
import { eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import {
	type Comment,
	challengeAcceptances,
	challenges,
	type User,
} from "../../db/schema"
import type { Tx } from "../../db/types"
import {
	afterCommentSent,
	assertAllowedCommentText,
	insertComment,
	parseComment,
	unblockedRecipients,
} from "../comments/send"
import { NotFoundError, ValidationError } from "../errors"
import type { Strictness } from "../moderation"
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
		const sent = await tx.query.comments.findFirst({
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

// A winner's one gloat on a challenge: a comment, sent only to whoever they
// beat.
export async function sendChallengeGloat(
	sender: User,
	challengeId: string,
	input: CommentInput,
): Promise<Comment> {
	const comment = parseComment(input)

	const challenge = await db.query.challenges.findFirst({
		where: { id: challengeId },
	})
	if (!challenge) throw new NotFoundError("That challenge doesn't exist.")

	// The creator's goes to people who may share nothing with them; an
	// acceptor's goes to one person, judged the way a presser question is.
	if (comment.text.length > 0) {
		const strictness: Strictness =
			sender.id !== challenge.creatorId &&
			(await sharesGroup(db, sender.id, challenge.creatorId))
				? "standard"
				: "strict"
		await assertAllowedCommentText(
			comment.text,
			sender.id,
			strictness,
			"challenge",
		)
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
		const sent = await tx.query.comments.findFirst({
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
		const row = await insertComment(
			tx,
			sender.id,
			targets.acceptance
				? {
						kind: "challenge_acceptor",
						challengeId: challenge.id,
						acceptanceId: targets.acceptance.id,
					}
				: { kind: "challenge_creator", challengeId: challenge.id },
			comment,
		)

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
		const unblocked = await unblockedRecipients(tx, sender.id, recipientIds)
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

	afterCommentSent(comment, sender.id)
	return gloat
}
