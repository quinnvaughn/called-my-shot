import {
	and,
	asc,
	count,
	desc,
	eq,
	getTableColumns,
	inArray,
	isNull,
	type SQL,
	sql,
} from "drizzle-orm"
import { db } from "../../db"
import { type Comment, commentLikes, comments } from "../../db/schema"
import { offsetPaginate, type PageArgs } from "../pagination"
import { notBlockedWith } from "./visibility"

// Reading a post's thread. Top-level comments come a page at a time, by Top
// (most liked, then newest) or Newest, optionally only the ones about one
// pick. Each shows its first replies inline, oldest first so they read as a
// conversation, with the rest a page further.
//
// Nobody sees comments from someone they've blocked or who has blocked
// them; they aren't counted in a reply count either. Removed comments stay
// in place (their text and GIF read as null) so replies under one keep their
// context.

export type ThreadSort = "top" | "newest"

// Replies shown under each comment before "View more replies".
export const INLINE_REPLIES = 2

const visibleTo = (viewerId: string | null): SQL | undefined =>
	viewerId ? notBlockedWith(viewerId, comments.senderId) : undefined

export function topLevelComments(
	viewerId: string | null,
	postId: string,
	{ sort, ...page }: PageArgs & { sort: ThreadSort },
) {
	const likes = sql<number>`(select count(*) from ${commentLikes} where ${commentLikes.commentId} = ${comments.id})`
	return offsetPaginate(page, ({ offset, limit }) =>
		db
			.select()
			.from(comments)
			.where(
				and(
					eq(comments.postId, postId),
					isNull(comments.parentId),
					visibleTo(viewerId),
				),
			)
			.orderBy(
				...(sort === "top" ? [desc(likes)] : []),
				desc(comments.createdAt),
				desc(comments.id),
			)
			.offset(offset)
			.limit(limit),
	)
}

// One top-level comment on the post, for paging through its replies past
// the inline few. Null for a reply, a comment on another post, or one from
// someone the viewer can't see.
export async function topLevelComment(
	viewerId: string | null,
	postId: string,
	commentId: string,
): Promise<Comment | null> {
	const [row] = await db
		.select()
		.from(comments)
		.where(
			and(
				eq(comments.id, commentId),
				eq(comments.postId, postId),
				isNull(comments.parentId),
				visibleTo(viewerId),
			),
		)
		.limit(1)
	return row ?? null
}

export function repliesTo(
	viewerId: string | null,
	parentId: string,
	page: PageArgs,
) {
	return offsetPaginate(page, ({ offset, limit }) =>
		db
			.select()
			.from(comments)
			.where(and(eq(comments.parentId, parentId), visibleTo(viewerId)))
			.orderBy(asc(comments.createdAt), asc(comments.id))
			.offset(offset)
			.limit(limit),
	)
}

// The first `limit` replies under each comment, for a page of the thread in
// one query.
export async function firstReplies(
	viewerId: string | null,
	parentIds: string[],
	limit: number,
): Promise<Map<string, Comment[]>> {
	const result = new Map<string, Comment[]>(parentIds.map((id) => [id, []]))
	if (parentIds.length === 0) return result
	const ranked = db
		.select({
			...getTableColumns(comments),
			rank: sql<number>`row_number() over (partition by ${comments.parentId} order by ${comments.createdAt}, ${comments.id})`.as(
				"rank",
			),
		})
		.from(comments)
		.where(and(inArray(comments.parentId, parentIds), visibleTo(viewerId)))
		.as("ranked")
	const rows = await db
		.select()
		.from(ranked)
		.where(sql`${ranked.rank} <= ${limit}`)
		.orderBy(ranked.rank)
	for (const { rank: _rank, ...row } of rows) {
		if (row.parentId) result.get(row.parentId)?.push(row)
	}
	return result
}

export async function replyCounts(
	viewerId: string | null,
	parentIds: string[],
): Promise<Map<string, number>> {
	if (parentIds.length === 0) return new Map()
	const rows = await db
		.select({ parentId: comments.parentId, n: count() })
		.from(comments)
		.where(and(inArray(comments.parentId, parentIds), visibleTo(viewerId)))
		.groupBy(comments.parentId)
	return new Map(
		rows.flatMap((row) => (row.parentId ? [[row.parentId, row.n]] : [])),
	)
}

// Every comment on the post, replies included, that the viewer can see.
export async function postCommentCount(
	viewerId: string | null,
	postIds: string[],
): Promise<Map<string, number>> {
	if (postIds.length === 0) return new Map()
	const rows = await db
		.select({ postId: comments.postId, n: count() })
		.from(comments)
		.where(and(inArray(comments.postId, postIds), visibleTo(viewerId)))
		.groupBy(comments.postId)
	return new Map(
		rows.flatMap((row) => (row.postId ? [[row.postId, row.n]] : [])),
	)
}
