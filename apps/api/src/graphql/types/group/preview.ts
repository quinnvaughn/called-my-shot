import { db } from "../../../db"
import { builder } from "../../builder"
import { CallRef } from "../question"
import { memberUserIds, trackedLeagueIds } from "./leaderboard"

export const GROUP_PREVIEW_MEMBER_LIMIT = 5
export const GROUP_PREVIEW_CALL_LIMIT = 3

const GroupPreviewMemberRef = builder
	.objectRef<{ id: string; name: string; avatarUrl: string | null }>(
		"GroupPreviewMember",
	)
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			name: t.exposeString("name"),
			avatarUrl: t.exposeString("avatarUrl", { nullable: true }),
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
		description: string | null
		logoUrl: string | null
		bannerUrl: string | null
		memberCount: number
		members: { id: string; name: string; avatarUrl: string | null }[]
		invitedBy: { name: string; username: string }
		trackedLeagues: { abbreviation: string }[]
		topScorer: { name: string; username: string; points: number } | null
	}>("GroupPreview")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			name: t.exposeString("name"),
			description: t.exposeString("description", { nullable: true }),
			logoUrl: t.exposeString("logoUrl", { nullable: true }),
			bannerUrl: t.exposeString("bannerUrl", { nullable: true }),
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
			// The newest calls any member made in the group's tracked leagues,
			// so an invitee sees what the group actually calls before joining.
			recentCalls: t.field({
				type: [CallRef],
				resolve: async (preview, _args, ctx) => {
					const [memberIds, tracked] = await Promise.all([
						memberUserIds(ctx, preview.id),
						trackedLeagueIds(ctx, preview.id),
					])
					return db.query.calls.findMany({
						where: {
							userId: { in: memberIds },
							...(tracked ? { question: { leagueId: { in: tracked } } } : {}),
						},
						orderBy: { createdAt: "desc", id: "desc" },
						limit: GROUP_PREVIEW_CALL_LIMIT,
					})
				},
			}),
		}),
	})
