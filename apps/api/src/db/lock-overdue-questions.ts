import { and, eq, lte } from "drizzle-orm"
import { expireGroupPins } from "../lib/group-pins"
import { LOCK_OVERDUE_QUESTIONS_LOCK } from "../lib/job-lock"
import { runCli } from "../lib/run-cli"
import { db } from "./index"
import { questions } from "./schema"

// Nothing else in the app flips a question off "open" the instant locksAt
// passes - every real-time check (call submission, the closing-soon sort)
// re-derives correctness from locksAt directly instead of trusting status
// (see the comments on both in question.ts). This job doesn't enforce
// anything either; it just keeps the status column itself honest for
// anything that reads it without also checking locksAt - admin views,
// future features - so "open" doesn't silently mean "open, unless you
// happen to check the clock too."
export async function lockOverdueQuestions({
	now = new Date(),
}: {
	now?: Date
} = {}): Promise<void> {
	const rows = await db
		.update(questions)
		.set({ status: "locked" })
		.where(and(eq(questions.status, "open"), lte(questions.locksAt, now)))
		.returning({ id: questions.id })
	console.log(`[lock-overdue-questions] locked ${rows.length} question(s)`)

	// Rides along here because a pin stops counting the moment its question
	// locks, and this is the job already watching for that.
	const unpinned = await expireGroupPins({ now })
	console.log(`[lock-overdue-questions] unpinned ${unpinned} group pin(s)`)
}

runCli(import.meta.url, lockOverdueQuestions, {
	lock: LOCK_OVERDUE_QUESTIONS_LOCK,
})
