import { db } from "../../../db"
import {
	type GroupWelcome,
	selectGroupWelcome,
} from "../../../lib/group-welcome"
import { builder } from "../../builder"
import { CallRef, QuestionRef } from "../question"
import { UserRef } from "../user"
import {
	memberUserIds,
	trackedLeagueIds,
	viewerMembership,
} from "./leaderboard"
import { GroupRef } from "./refs"

const GroupWelcomeSource = builder.enumType("GroupWelcomeSource", {
	values: ["PINNED", "SUGGESTED"] as const,
})

const GroupWelcomeRef = builder
	.objectRef<GroupWelcome>("GroupWelcome")
	.implement({
		fields: (t) => ({
			// Whose invite link the viewer joined through.
			inviter: t.field({
				type: UserRef,
				nullable: true,
				resolve: async (welcome) => {
					if (!welcome.inviterId) return null
					const user = await db.query.users.findFirst({
						where: { id: welcome.inviterId },
					})
					return user ?? null
				},
			}),
			// The question to call right now. Null when nothing in the group's
			// leagues is open long enough.
			question: t.field({
				type: QuestionRef,
				nullable: true,
				resolve: (welcome) => welcome.question,
			}),
			source: t.field({
				type: GroupWelcomeSource,
				nullable: true,
				resolve: (welcome) => welcome.source,
			}),
			// The inviter's call on that question, if they made one.
			inviterCall: t.field({
				type: CallRef,
				nullable: true,
				resolve: (welcome) => welcome.inviterCall,
			}),
			memberCallCount: t.int({ resolve: (welcome) => welcome.memberCallCount }),
			otherPinnedCount: t.int({
				resolve: (welcome) => welcome.otherPinnedCount,
			}),
		}),
	})

builder.objectFields(GroupRef, (t) => ({
	// What the welcome modal shows the viewer, or null when they aren't a
	// member. Computed fresh on every read, so only the modal should select
	// it.
	welcome: t.field({
		type: GroupWelcomeRef,
		nullable: true,
		resolve: async (group, _args, ctx) => {
			const membership = await viewerMembership(ctx, group.id)
			if (!membership) return null
			const [tracked, memberIds] = await Promise.all([
				trackedLeagueIds(ctx, group.id),
				memberUserIds(ctx, group.id),
			])
			return selectGroupWelcome({
				groupId: group.id,
				viewerId: membership.userId,
				inviterId: membership.invitedById,
				trackedLeagueIds: tracked,
				memberIds,
			})
		},
	}),
}))
