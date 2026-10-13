import { challengeGroupPosts } from "../../db/schema"
import type { Tx } from "../../db/types"
import { AuthorizationError } from "../errors"
import { notifyOtherMembers } from "../groups"

// Puts a challenge on the Home of each group, telling everyone else there.
// Only its creator can post it, and only into groups they're in. Posting
// to a group it's already in is a no-op and tells nobody twice.
export async function postChallengeToGroups(
	tx: Tx,
	actor: { id: string; username: string },
	challenge: { id: string; creatorId: string },
	groupIds: string[],
) {
	if (challenge.creatorId !== actor.id) {
		throw new AuthorizationError("Only whoever made a challenge can post it.")
	}
	const ids = [...new Set(groupIds)]
	if (ids.length === 0) return

	const memberships = await tx.query.groupMembers.findMany({
		where: { userId: actor.id, groupId: { in: ids } },
		columns: { groupId: true },
		with: { group: { columns: { id: true, name: true } } },
	})
	if (memberships.length !== ids.length) {
		throw new AuthorizationError("You're not a member of that group.")
	}

	const inserted = await tx
		.insert(challengeGroupPosts)
		.values(
			ids.map((groupId) => ({
				challengeId: challenge.id,
				groupId,
				postedById: actor.id,
			})),
		)
		.onConflictDoNothing()
		.returning({ groupId: challengeGroupPosts.groupId })

	for (const { groupId } of inserted) {
		const group = memberships.find((m) => m.groupId === groupId)?.group
		if (!group) continue
		await notifyOtherMembers(tx, groupId, actor.id, (userId) => ({
			type: "challenge_posted_to_group",
			userId,
			challengeId: challenge.id,
			groupId,
			groupName: group.name,
			actorId: actor.id,
			actorUsername: actor.username,
		}))
	}
}
