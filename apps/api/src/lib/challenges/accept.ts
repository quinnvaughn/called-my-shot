import { eq } from "drizzle-orm"
import { challengeAcceptances, challenges } from "../../db/schema"
import type { Tx } from "../../db/types"
import { insertCallInTx, prepareCall } from "../cast-call"
import { NotFoundError, ValidationError } from "../errors"
import { createNotification } from "../notifications"
import { isBlockedEitherWay } from "../pressers/ask"
import { loadChallengeQuestionFacts } from "./load"
import { challengeState } from "./outcome"

// A call made as part of accepting, one per question the acceptor hasn't
// called yet. Shaped like castCall's input, without a fade.
export type ChallengeCallInput = { questionId: string } & Record<
	string,
	unknown
>

// Takes a challenge on. The acceptor needs a call on every question in it:
// the ones they've already made count as they stand, and `callInputs` has to
// cover exactly the rest. Everything lands together or not at all, so a
// question locking partway through can't leave someone half in.
export async function acceptChallenge(
	tx: Tx,
	acceptor: { id: string; username: string },
	code: string,
	callInputs: ChallengeCallInput[],
) {
	const [challenge] = await tx
		.select()
		.from(challenges)
		.where(eq(challenges.code, code))
		.for("update")
	if (!challenge) throw new NotFoundError("That challenge doesn't exist.")
	if (challenge.creatorId === acceptor.id) {
		throw ValidationError.field(null, "You can't take on your own challenge.")
	}
	if (await isBlockedEitherWay(tx, challenge.creatorId, acceptor.id)) {
		throw ValidationError.field(null, "You can't take on this challenge.")
	}

	// The row lock above makes this check safe against a second accept
	// racing in from another tab.
	const already = await tx.query.challengeAcceptances.findFirst({
		where: { challengeId: challenge.id, acceptorId: acceptor.id },
		columns: { id: true },
	})
	if (already) {
		throw ValidationError.field(null, "You've already taken this one on.")
	}

	const facts =
		(await loadChallengeQuestionFacts([challenge.id], tx)).get(challenge.id) ??
		[]
	if (challengeState(facts) !== "open") {
		throw ValidationError.field(
			null,
			"This challenge closed when its first question locked.",
		)
	}

	const questionIds = facts
		.filter((q) => q.status !== "voided")
		.map((q) => q.id)
	const called = new Set(
		(
			await tx.query.calls.findMany({
				where: { userId: acceptor.id, questionId: { in: questionIds } },
				columns: { questionId: true },
			})
		).map((c) => c.questionId),
	)

	const inputByQuestionId = new Map<string, ChallengeCallInput>()
	for (const input of callInputs) {
		if (!questionIds.includes(input.questionId)) {
			throw ValidationError.field(
				null,
				"That question isn't in this challenge.",
			)
		}
		if (called.has(input.questionId)) {
			throw ValidationError.field(null, "You've already called that question.")
		}
		if (inputByQuestionId.has(input.questionId)) {
			throw ValidationError.field(null, "That's two calls on one question.")
		}
		inputByQuestionId.set(input.questionId, input)
	}
	const missing = questionIds.filter(
		(id) => !called.has(id) && !inputByQuestionId.has(id),
	)
	if (missing.length > 0) {
		throw ValidationError.field(
			null,
			"Call every question in the challenge to take it on.",
		)
	}

	const questionRows =
		inputByQuestionId.size === 0
			? []
			: await tx.query.questions.findMany({
					where: { id: { in: [...inputByQuestionId.keys()] } },
				})
	for (const question of questionRows) {
		const data = await prepareCall(
			question,
			inputByQuestionId.get(question.id),
			tx,
		)
		await insertCallInTx(tx, { userId: acceptor.id, question, data })
	}

	const [acceptance] = await tx
		.insert(challengeAcceptances)
		.values({ challengeId: challenge.id, acceptorId: acceptor.id })
		.returning()

	await createNotification(tx, {
		type: "challenge_accepted",
		userId: challenge.creatorId,
		challengeId: challenge.id,
		actorId: acceptor.id,
		actorUsername: acceptor.username,
	})
	return { challenge, acceptance }
}
