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

const GroupPreviewLeagueRef = builder
	.objectRef<{ abbreviation: string }>("GroupPreviewLeague")
	.implement({
		fields: (t) => ({
			abbreviation: t.exposeString("abbreviation"),
		}),
	})

export const GroupPreviewRef = builder
	.objectRef<{
		id: string
		name: string
		memberCount: number
		members: { id: string; name: string }[]
		invitedBy: { name: string; username: string }
		trackedLeagues: { abbreviation: string }[]
		topScorer: { name: string; username: string; points: number } | null
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
			// empty means the group tracks every league
			trackedLeagues: t.field({
				type: [GroupPreviewLeagueRef],
				resolve: (preview) => preview.trackedLeagues,
			}),
			// #1 on the group's default board: current season, tracked leagues
			// only. null until someone has points there, so an offseason group
			// doesn't advertise a leader on 0.
			topScorer: t.field({
				type: GroupPreviewTopScorerRef,
				nullable: true,
				resolve: (preview) => preview.topScorer,
			}),
		}),
	})
