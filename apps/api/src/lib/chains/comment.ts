import type { CommentInput } from "@called-my-shot/schemas"
import { db } from "../../db"
import type { Comment, User } from "../../db/schema"
import {
	afterCommentSent,
	assertAllowedCommentText,
	insertComment,
	parseComment,
	unblockedRecipients,
} from "../comments/send"
import { AuthorizationError, NotFoundError } from "../errors"
import { createNotifications } from "../notifications"
import { loadChainLinks } from "./load"
import { approvedLinks } from "./state"

// A chain's thread is the group's, not just the chain's: anyone in the group
// can post, as often as they like, and everyone in the chain hears about it.

export async function canCommentOnChain(
	viewerId: string,
	chain: { groupId: string },
): Promise<boolean> {
	const membership = await db.query.groupMembers.findFirst({
		where: { groupId: chain.groupId, userId: viewerId },
		columns: { id: true },
	})
	return membership !== undefined
}

export async function sendChainComment(
	sender: User,
	chainId: string,
	input: CommentInput,
): Promise<Comment> {
	const comment = parseComment(input)
	const chain = await db.query.chains.findFirst({ where: { id: chainId } })
	if (!chain) throw new NotFoundError("That chain doesn't exist.")
	if (!(await canCommentOnChain(sender.id, chain))) {
		throw new AuthorizationError("You're not a member of this group.")
	}
	// Everyone who reads it shares the group with the sender, the same
	// standard a presser question from a groupmate is held to.
	await assertAllowedCommentText(comment.text, sender.id, "standard", "chain")

	const row = await db.transaction(async (tx) => {
		const inserted = await insertComment(
			tx,
			sender.id,
			{ kind: "chain", chainId: chain.id },
			comment,
		)
		const links = (await loadChainLinks([chain.id], tx)).get(chain.id) ?? []
		const members = [
			...new Set([
				...(chain.starterId ? [chain.starterId] : []),
				...approvedLinks(links).map((link) => link.userId),
			]),
		]
		const group = await tx.query.groups.findFirst({
			where: { id: chain.groupId },
			columns: { id: true, name: true },
		})
		if (group) {
			const recipients = await unblockedRecipients(tx, sender.id, members)
			await createNotifications(
				tx,
				recipients.map((userId) => ({
					type: "chain_commented" as const,
					userId,
					chainId: chain.id,
					groupId: group.id,
					groupName: group.name,
					actorId: sender.id,
					actorUsername: sender.username,
				})),
			)
		}
		return inserted
	})
	afterCommentSent(comment, sender.id)
	return row
}
