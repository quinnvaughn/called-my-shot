import {
	type CommentGif,
	type CommentInput,
	commentSchema,
} from "@called-my-shot/schemas"
import { type Comment, comments } from "../../db/schema"
import type { Tx } from "../../db/types"
import { ValidationError } from "../errors"
import { registerGifShare } from "../gifs/klipy"
import type { Strictness } from "../moderation"
import { assertAllowedText } from "../moderation/guard"
import { isBlockedEitherWay } from "../pressers/ask"

// What every comment shares, whatever it was posted on: parsing, the text
// check, the row itself, and the GIF share after it commits. Who may post on
// a thing, how often, and who hears about it are the caller's rules - see
// lib/challenges/gloat.ts and lib/chains/comment.ts.

export type CommentTarget =
	| { kind: "challenge_creator"; challengeId: string }
	| { kind: "challenge_acceptor"; challengeId: string; acceptanceId: string }
	| { kind: "chain"; chainId: string }

export type ParsedComment = { text: string; gif: CommentGif | null }

export function parseComment(input: CommentInput): ParsedComment {
	const parsed = commentSchema.safeParse(input)
	if (!parsed.success) throw ValidationError.fromZodIssues(parsed.error.issues)
	return { text: parsed.data.text, gif: parsed.data.gif ?? null }
}

// Run before the caller's transaction: the moderation call is a network
// round trip, and a refusal shouldn't hold any lock.
export async function assertAllowedCommentText(
	text: string,
	senderId: string,
	strictness: Strictness,
	on: "challenge" | "chain",
): Promise<void> {
	if (text.length === 0) return
	await assertAllowedText(text, "text", strictness, (category) => ({
		event: "comment_text_blocked",
		userId: senderId,
		properties: { category, strictness, on },
	}))
}

export async function insertComment(
	tx: Tx,
	senderId: string,
	target: CommentTarget,
	{ text, gif }: ParsedComment,
): Promise<Comment> {
	const [row] = await tx
		.insert(comments)
		.values({
			senderId,
			kind: target.kind,
			challengeId: "challengeId" in target ? target.challengeId : null,
			acceptanceId: "acceptanceId" in target ? target.acceptanceId : null,
			chainId: "chainId" in target ? target.chainId : null,
			text: text.length > 0 ? text : null,
			gifProvider: gif ? "klipy" : null,
			gifId: gif?.id ?? null,
			gifUrl: gif?.url ?? null,
			gifWidth: gif?.width ?? null,
			gifHeight: gif?.height ?? null,
			gifAlt: gif?.alt || null,
		})
		.returning()
	if (!row) throw new Error("Comment insert returned nothing")
	return row
}

// The recipients a sender hasn't blocked and isn't blocked by.
export async function unblockedRecipients(
	tx: Tx,
	senderId: string,
	userIds: string[],
): Promise<string[]> {
	const unblocked: string[] = []
	for (const userId of userIds) {
		if (userId === senderId) continue
		if (!(await isBlockedEitherWay(tx, senderId, userId)))
			unblocked.push(userId)
	}
	return unblocked
}

// After the comment's transaction commits: tells the provider the GIF was
// used, which is what its trending list is built from.
export function afterCommentSent(comment: ParsedComment, senderId: string) {
	if (comment.gif) registerGifShare(comment.gif.id, senderId)
}
