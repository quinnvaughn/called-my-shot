import type { PostCommentsQuery } from "#/graphql/generated/graphql"

// A top-level comment as the thread reads it, with its first replies.
export type ThreadComment = NonNullable<
	PostCommentsQuery["post"]
>["comments"]["items"][number]

// What every comment row shows, top-level or reply.
export type CommentFields = ThreadComment["replies"]["items"][number]

// Who a reply box is answering. `mention` is set when it's a reply to a
// reply, which @mentions that person; a reply to the top-level comment
// needs none.
export type ReplyTarget = {
	mention: { id: string; username: string } | null
}
