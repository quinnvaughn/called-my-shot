import type { Presser, PresserQuestion } from "../../db/schema"
import { isPresserOpen } from "./app-questions"

// Who sees which of a presser's questions. Everything that reads them goes
// through here:
//
// - Answered (a written answer or "No comment") is public, signed out
//   included. Answering is the owner's choice to make a question public.
// - Pending is seen only by the owner and by its own asker, and only while
//   the presser is open. Past close it's as if it was never asked.
// - Withdrawn and removed are seen by nobody.
export function canSeeQuestion(
	question: Pick<PresserQuestion, "status" | "askerId">,
	presser: Pick<Presser, "userId" | "closesAt">,
	viewerId: string | null,
	now = new Date(),
): boolean {
	if (question.status === "answered") return true
	if (question.status !== "pending") return false
	if (!isPresserOpen(presser, now) || viewerId === null) return false
	return viewerId === presser.userId || viewerId === question.askerId
}

// The statement, unless an admin took it down.
export function visibleStatement(
	presser: Pick<Presser, "statementText" | "statementRemovedAt">,
): string | null {
	return presser.statementRemovedAt ? null : presser.statementText
}
