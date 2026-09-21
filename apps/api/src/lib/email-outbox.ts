import { emailOutbox } from "../db/schema"
import type { Tx } from "../db/types"

export type ResolvedCallEmail = {
	userId: string
	questionId: string
	callId: string
}

// Takes the caller's transaction, like createNotifications - the queued row
// and the scoring it describes have to commit or roll back together, or a
// failed resolve could still send mail about points nobody was awarded.
//
// onConflictDoNothing against the partial unique index on (call_id) where
// sent_at is null: a single resolution enqueues a call once. It deliberately
// does NOT block a re-enqueue after the first email has gone out, so an
// overturned dispute - which re-runs the whole scoring pass with a different
// outcome - mails the corrected result rather than staying silent about it.
export async function enqueueResolvedCallEmails(
	tx: Tx,
	entries: ResolvedCallEmail[],
): Promise<void> {
	if (entries.length === 0) return
	await tx
		.insert(emailOutbox)
		.values(
			entries.map((entry) => ({
				userId: entry.userId,
				type: "call_resolved" as const,
				questionId: entry.questionId,
				callId: entry.callId,
			})),
		)
		.onConflictDoNothing()
}
