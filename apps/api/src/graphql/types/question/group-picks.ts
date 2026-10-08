import { db } from "../../../db"
import type { User } from "../../../db/schema"
import { type GroupPickTally, loadGroupPicks } from "../../../lib/group-picks"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { UserRef } from "../user"

type GroupPickRow = Omit<GroupPickTally, "sampleUserId"> & { sampleUser: User }

export const GroupPickTallyRef = builder
	.objectRef<GroupPickRow>("GroupPickTally")
	.implement({
		fields: (t) => ({
			optionId: t.exposeID("optionId"),
			// Group-mates on this option, the viewer never among them.
			count: t.exposeInt("count"),
			// The one of them who picked it most recently.
			sampleUser: t.field({ type: UserRef, resolve: (r) => r.sampleUser }),
		}),
	})

// Question.viewerGroupPicks for a page of questions: one query for the
// tallies, one for the people they name. Signed out, nobody is a group-mate.
export async function loadViewerGroupPicks(
	questionIds: string[],
	ctx: Context,
): Promise<GroupPickRow[][]> {
	if (!ctx.user) return questionIds.map(() => [])
	const tallies = await loadGroupPicks(ctx.user.id, questionIds)
	const userIds = [
		...new Set(tallies.flat().map((tally) => tally.sampleUserId)),
	]
	const users = userIds.length
		? await db.query.users.findMany({ where: { id: { in: userIds } } })
		: []
	const userById = new Map(users.map((user) => [user.id, user]))
	return tallies.map((list) =>
		list.flatMap(({ sampleUserId, ...tally }) => {
			const sampleUser = userById.get(sampleUserId)
			return sampleUser ? [{ ...tally, sampleUser }] : []
		}),
	)
}
