import { builder } from "../../builder"

export const GROUP_PREVIEW_MEMBER_LIMIT = 5

const GroupPreviewMemberRef = builder
	.objectRef<{ id: string; name: string }>("GroupPreviewMember")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			name: t.exposeString("name"),
		}),
	})

const GroupPreviewInvitedByRef = builder
	.objectRef<{ name: string; username: string }>("GroupPreviewInvitedBy")
	.implement({
		fields: (t) => ({
			name: t.exposeString("name"),
			username: t.exposeString("username"),
		}),
	})

const GroupPreviewTopScorerRef = builder
	.objectRef<{ name: string; username: string; points: number }>(
		"GroupPreviewTopScorer",
	)
	.implement({
		fields: (t) => ({
			name: t.exposeString("name"),
			username: t.exposeString("username"),
			points: t.exposeInt("points"),
		}),
	})

export const GroupPreviewRef = builder
	.objectRef<{
		id: string
		name: string
		memberCount: number
		members: { id: string; name: string }[]
		invitedBy: { name: string; username: string }
		topScorer: { name: string; username: string; points: number }
	}>("GroupPreview")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			name: t.exposeString("name"),
			memberCount: t.exposeInt("memberCount"),
			// capped preview for an avatar stack - not the full roster, this is
			// visible to unauthenticated visitors
			members: t.field({
				type: [GroupPreviewMemberRef],
				resolve: (preview) => preview.members,
			}),
			invitedBy: t.field({
				type: GroupPreviewInvitedByRef,
				resolve: (preview) => preview.invitedBy,
			}),
			// ranked by total points across every sport a member has called, same
			// as the real leaderboard - there's no "season" here, just points
			topScorer: t.field({
				type: GroupPreviewTopScorerRef,
				resolve: (preview) => preview.topScorer,
			}),
		}),
	})
