import { and, eq, lte } from "drizzle-orm"
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
async function main() {
	const rows = await db
		.update(questions)
		.set({ status: "locked" })
		.where(and(eq(questions.status, "open"), lte(questions.locksAt, new Date())))
		.returning({ id: questions.id })
	console.log(`[lock-overdue-questions] locked ${rows.length} question(s)`)
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})
