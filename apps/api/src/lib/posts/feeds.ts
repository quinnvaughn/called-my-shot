import {
	and,
	desc,
	eq,
	inArray,
	isNull,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm"
import { db } from "../../db"
import {
	follows,
	type Post,
	postLikes,
	posts,
	postTags,
	prompts,
	type SpaceKind,
} from "../../db/schema"
import {
	clampPageSize,
	decodeCursor,
	offsetPaginate,
	type PageArgs,
	paginate,
} from "../pagination"
import { liveAndUnblocked, viewerGroupIds } from "./visibility"

// Every list of posts in the app. All newest first and keyset-paged, apart
// from a prompt's answers sorted Top. All of them leave out removed posts,
// posts on a removed prompt, and anyone the viewer and the author have
// blocked between them.
//
// A group post only ever appears in its group's feed and its members' Home.
// Never in a space, on a profile or under a prompt's answers, which are all
// public.

type Feed = Promise<{
	items: Post[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}>

async function keysetFeed(
	args: PageArgs,
	viewerId: string | null,
	where: SQL | undefined,
): Feed {
	const limit = clampPageSize(args.first)
	const cursor = args.after ? decodeCursor(args.after) : null
	const rows = await db
		.select()
		.from(posts)
		.where(
			and(
				where,
				liveAndUnblocked(posts, viewerId),
				cursor
					? or(
							lt(posts.createdAt, cursor.createdAt),
							and(
								eq(posts.createdAt, cursor.createdAt),
								lt(posts.id, cursor.id),
							),
						)
					: undefined,
			),
		)
		.orderBy(desc(posts.createdAt), desc(posts.id))
		.limit(limit + 1)
	return paginate(rows, limit)
}

const taggedWith = (kind: SpaceKind, spaceId: string) =>
	sql`exists (select 1 from ${postTags} where ${postTags.postId} = ${posts.id} and ${postTags.spaceKind} = ${kind} and ${postTags.spaceId} = ${spaceId})`

// Home: public posts in any space the viewer follows or by anyone they
// follow, everything posted in their groups, and their own.
export function homeFeed(viewerId: string, args: PageArgs): Feed {
	const followsATag = sql`exists (select 1 from ${postTags} inner join ${follows} on ${follows.targetKind}::text = ${postTags.spaceKind}::text and ${follows.targetId} = ${postTags.spaceId} where ${postTags.postId} = ${posts.id} and ${follows.followerId} = ${viewerId})`
	const followsAuthor = sql`exists (select 1 from ${follows} where ${follows.followerId} = ${viewerId} and ${follows.targetKind} = 'user' and ${follows.targetId} = ${posts.authorId})`
	return keysetFeed(
		args,
		viewerId,
		or(
			eq(posts.authorId, viewerId),
			inArray(posts.groupId, viewerGroupIds(viewerId)),
			and(isNull(posts.groupId), or(followsATag, followsAuthor)),
		),
	)
}

// A league's, team's or player's space: public posts tagged with it.
export function spaceFeed(
	viewerId: string | null,
	kind: SpaceKind,
	spaceId: string,
	args: PageArgs,
): Feed {
	return keysetFeed(
		args,
		viewerId,
		and(isNull(posts.groupId), taggedWith(kind, spaceId)),
	)
}

// Everything posted in a group. Whether the viewer may read it is the
// caller's check.
export function groupFeed(
	viewerId: string | null,
	groupId: string,
	args: PageArgs,
): Feed {
	return keysetFeed(args, viewerId, eq(posts.groupId, groupId))
}

// A profile: the person's public posts.
export function userFeed(
	viewerId: string | null,
	authorId: string,
	args: PageArgs,
): Feed {
	return keysetFeed(
		args,
		viewerId,
		and(eq(posts.authorId, authorId), isNull(posts.groupId)),
	)
}

export type AnswerSort = "top" | "newest"

const likeCount = sql<number>`(select count(*) from ${postLikes} where ${postLikes.postId} = ${posts.id})`

// A prompt's public answers. Top is most liked first, newest breaking ties.
export function promptAnswers(
	viewerId: string | null,
	promptId: string,
	sort: AnswerSort,
	args: PageArgs,
): Feed {
	const where = and(eq(posts.promptId, promptId), isNull(posts.groupId))
	if (sort === "newest") return keysetFeed(args, viewerId, where)
	return offsetPaginate(args, ({ offset, limit }) =>
		db
			.select()
			.from(posts)
			.where(and(where, liveAndUnblocked(posts, viewerId)))
			.orderBy(desc(likeCount), desc(posts.createdAt), desc(posts.id))
			.offset(offset)
			.limit(limit),
	)
}

// The most-liked public Rushmores of a franchise, for a Home with nothing
// followed in it yet.
export function popularTeamRushmores(
	viewerId: string | null,
	args: PageArgs,
): Feed {
	return offsetPaginate(args, ({ offset, limit }) =>
		db
			.select({ post: posts })
			.from(posts)
			.innerJoin(prompts, eq(prompts.id, posts.promptId))
			.where(
				and(
					isNull(posts.groupId),
					sql`${prompts.teamId} is not null`,
					isNull(prompts.creatorId),
					liveAndUnblocked(posts, viewerId),
				),
			)
			.orderBy(desc(likeCount), desc(posts.createdAt), desc(posts.id))
			.offset(offset)
			.limit(limit)
			.then((rows) => rows.map((row) => row.post)),
	)
}
