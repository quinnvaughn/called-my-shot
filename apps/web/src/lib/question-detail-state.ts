import type { QuestionStatus } from "#/graphql/generated/graphql"

export type QuestionDetailState = {
	// RESOLVED or DISPUTED - a dispute carries the same prior resolution data,
	// just contested (see ResolutionBanner) - both count as settled.
	isSettled: boolean
	isDisputed: boolean
	// Derived from locksAt directly, not trusted from status alone - nothing
	// in the app ever flips status from "open" to "locked" once locksAt
	// passes (no cron/worker exists), so a stale "open" row past its lock
	// time still reads as locked here.
	isLocked: boolean
	canCall: boolean
}

export function questionDetailState(
	question: { status: QuestionStatus; locksAt: string },
	now: number = Date.now(),
): QuestionDetailState {
	const isSettled =
		question.status === "RESOLVED" || question.status === "DISPUTED"
	const isDisputed = question.status === "DISPUTED"
	const isLocked =
		!isSettled &&
		(question.status !== "OPEN" || new Date(question.locksAt).getTime() <= now)
	const canCall = !isSettled && !isLocked

	return { isSettled, isDisputed, isLocked, canCall }
}
