import type { Question } from "../../../../db/schema"
import { resolutionDisputes } from "../../../../db/schema"
import type { Tx } from "../../../../db/types"
import { ValidationError } from "../../../../lib/errors"
import { lockOrThrow } from "../../../helpers"

// Readiness is derived from locksAt, never trusted from status: nothing flips
// a question off "open" the instant its lock time passes.
export function assertLocked(question: Pick<Question, "locksAt">) {
	if (question.locksAt > new Date()) {
		throw ValidationError.field(null, "This question hasn't locked yet.")
	}
}

// A disputed question already went through resolution once, so it counts as
// resolved here too.
export function assertUnresolved(question: Pick<Question, "status">) {
	if (question.status === "resolved" || question.status === "disputed") {
		throw ValidationError.field(
			null,
			"This question has already been resolved.",
		)
	}
}

// The Disputes tab's actions all start from a dispute that's still open,
// locked for the rest of the transaction.
export async function lockOpenDispute(tx: Tx, disputeId: string) {
	const dispute = await lockOrThrow(
		tx,
		resolutionDisputes,
		disputeId,
		"Dispute not found",
	)
	if (dispute.status !== "open") {
		throw ValidationError.field(null, "This dispute is already settled.")
	}
	return dispute
}
