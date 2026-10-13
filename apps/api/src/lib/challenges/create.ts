import {
	type CreateChallengeInput,
	createChallengeSchema,
} from "@called-my-shot/schemas"
import { challengeQuestions, challenges } from "../../db/schema"
import type { Tx } from "../../db/types"
import { isAcceptingCalls } from "../cast-call"
import { ValidationError } from "../errors"
import { withRetriedCode } from "../invite-codes"
import { postChallengeToGroups } from "./groups"

// Starts a challenge on the given questions. The creator doesn't need to have
// called any of them yet: they can share it straight away and call each one
// any time before it locks. Every question has to be open now, since a
// question that's already locked could never be called by anyone accepting.
export async function createChallenge(
	tx: Tx,
	creator: { id: string; username: string },
	input: CreateChallengeInput,
) {
	const parsed = createChallengeSchema.safeParse(input)
	if (!parsed.success) throw ValidationError.fromZodIssues(parsed.error.issues)
	const questionIds = [...new Set(parsed.data.questionIds)]

	const rows = await tx.query.questions.findMany({
		where: { id: { in: questionIds } },
		columns: { id: true, status: true, locksAt: true },
	})
	if (rows.length !== questionIds.length) {
		throw ValidationError.field(
			"questionIds",
			"One of those questions is gone.",
		)
	}
	if (!rows.every((q) => isAcceptingCalls(q))) {
		throw ValidationError.field(
			"questionIds",
			"Every question in a challenge has to still be open.",
		)
	}

	const challenge = await withRetriedCode((code) =>
		tx.transaction(async (sp) => {
			const [row] = await sp
				.insert(challenges)
				.values({ code, creatorId: creator.id })
				.returning()
			return row
		}),
	)
	await tx.insert(challengeQuestions).values(
		questionIds.map((questionId, position) => ({
			challengeId: challenge.id,
			questionId,
			position,
		})),
	)

	if (parsed.data.groupIds.length > 0) {
		await postChallengeToGroups(tx, creator, challenge, parsed.data.groupIds)
	}
	return challenge
}
