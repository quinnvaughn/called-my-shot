import { match } from "ts-pattern"
import type { QuestionStatus } from "#/graphql/generated/graphql"

// A question's lifecycle as one value. The flags on QuestionDetailState are
// all derived from it, so they can never contradict each other.
export type QuestionPhase =
	| "open"
	| "locked"
	| "resolved"
	| "disputed"
	| "voided"

export type QuestionDetailState = {
	phase: QuestionPhase
	// RESOLVED or DISPUTED - a dispute carries the same prior resolution data,
	// just contested (see ResolutionBanner) - both count as settled. VOIDED is
	// final too, but has no result to show, so it isn't settled in this sense.
	isSettled: boolean
	isDisputed: boolean
	isVoided: boolean
	isLocked: boolean
	canCall: boolean
}

// The lock is derived from locksAt directly, not trusted from status alone -
// the API only flips "open" to "locked" every 15 minutes, so a row can still
// read "open" for a while after its lock time and has to read as locked here.
export function questionPhase(
	question: { status: QuestionStatus; locksAt: string },
	now: number = Date.now(),
): QuestionPhase {
	return match(question.status)
		.returnType<QuestionPhase>()
		.with("RESOLVED", () => "resolved")
		.with("DISPUTED", () => "disputed")
		.with("VOIDED", () => "voided")
		.with("LOCKED", () => "locked")
		.with("OPEN", () =>
			new Date(question.locksAt).getTime() <= now ? "locked" : "open",
		)
		.exhaustive()
}

export function questionDetailState(
	question: { status: QuestionStatus; locksAt: string },
	now: number = Date.now(),
): QuestionDetailState {
	const phase = questionPhase(question, now)

	return {
		phase,
		isSettled: phase === "resolved" || phase === "disputed",
		isDisputed: phase === "disputed",
		isVoided: phase === "voided",
		isLocked: phase === "locked",
		canCall: phase === "open",
	}
}
