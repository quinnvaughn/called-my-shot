import { db } from "../../../db"
import {
	groupFeed,
	homeFeed,
	popularTeamRushmores,
	publicFeed,
	spaceFeed,
	userFeed,
} from "../../../lib/posts/feeds"
import { loadVisiblePost } from "../../../lib/posts/visibility"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { viewerMembership } from "../group/leaderboard"
import { GroupRef } from "../group/refs"
import { UserRef } from "../user"
import { PostConnectionRef, PostInterfaceRef, SpaceKindEnum } from "./refs"

const EMPTY = { items: [], pageInfo: { hasNextPage: false, endCursor: null } }

builder.queryFields((t) => ({
	// One post, for its page. Null when the viewer can't see it: a group post
	// to a non-member, anything taken down, or an author they've blocked.
	post: t.field({
		type: PostInterfaceRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const id = String(args.id)
			if (!isUuid(id)) return null
			return (await loadVisiblePost(db, ctx.user?.id ?? null, id))?.post ?? null
		},
	}),
	// Home: for a signed-in viewer, public posts in the spaces they follow
	// and by the people they follow, everything in their groups, and their
	// own. Signed out, every public post.
	homeFeed: t.field({
		type: PostConnectionRef,
		args: { first: t.arg.int(), after: t.arg.string() },
		resolve: (_root, args, ctx) =>
			ctx.user ? homeFeed(ctx.user.id, args) : publicFeed(null, args),
	}),
	// A league's, team's or player's feed: public posts tagged with it.
	spaceFeed: t.field({
		type: PostConnectionRef,
		args: {
			kind: t.arg({ type: SpaceKindEnum, required: true }),
			id: t.arg.id({ required: true }),
			first: t.arg.int(),
			after: t.arg.string(),
		},
		resolve: (_root, args, ctx) => {
			const id = String(args.id)
			if (!isUuid(id)) return EMPTY
			return spaceFeed(ctx.user?.id ?? null, args.kind, id, args)
		},
	}),
	// The most-liked franchise Rushmores, for a Home with nothing in it yet.
	popularRushmores: t.field({
		type: PostConnectionRef,
		args: { first: t.arg.int(), after: t.arg.string() },
		resolve: (_root, args, ctx) =>
			popularTeamRushmores(ctx.user?.id ?? null, args),
	}),
}))

builder.objectFields(GroupRef, (t) => ({
	// Everything posted in the group, newest first. Members only.
	posts: t.field({
		type: PostConnectionRef,
		args: { first: t.arg.int(), after: t.arg.string() },
		resolve: async (group, args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) return EMPTY
			return groupFeed(ctx.user?.id ?? null, group.id, args)
		},
	}),
}))

builder.objectFields(UserRef, (t) => ({
	// The person's public posts, newest first. What they posted in groups
	// stays in those groups.
	posts: t.field({
		type: PostConnectionRef,
		args: { first: t.arg.int(), after: t.arg.string() },
		resolve: (user, args, ctx) => userFeed(ctx.user?.id ?? null, user.id, args),
	}),
}))
