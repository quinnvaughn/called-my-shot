import { useInfiniteQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { postCommentRepliesQuery } from "#/graphql/posts/queries"
import { pluralize } from "#/lib/pluralize"
import { CommentRow } from "./comment-row"
import type { CommentFields, ThreadComment } from "./types"

type Props = {
	postId: string
	comment: ThreadComment
	// Once opened, every reply reads from the first, a page at a time.
	expanded: boolean
	onExpand: () => void
	onReply?: (reply: CommentFields) => void
}

const moreButton = css({
	alignSelf: "flex-start",
	textStyle: "meta",
	color: "fg.muted",
	cursor: "pointer",
	_hover: { color: "fg.default", textDecoration: "underline" },
})

// The replies under a top-level comment, oldest first: the first two inline,
// then "View N more replies" for the rest.
export function ReplyList({
	postId,
	comment,
	expanded,
	onExpand,
	onReply,
}: Props) {
	const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useInfiniteQuery({
			...postCommentRepliesQuery({ postId, commentId: comment.id }),
			enabled: expanded,
		})
	const replies: CommentFields[] =
		expanded && data ? data.items : comment.replies.items
	const hidden = Math.max(0, comment.replyCount - replies.length)

	if (replies.length === 0 && hidden === 0) return null

	return (
		<VStack
			gap="3"
			alignItems="stretch"
			className={css({
				paddingInlineStart: "3",
				borderLeft: "1px solid {colors.border.default}",
			})}
		>
			{replies.map((reply) => (
				<CommentRow
					key={reply.id}
					comment={reply}
					size="sm"
					onReply={onReply ? () => onReply(reply) : undefined}
				/>
			))}
			{!expanded && hidden > 0 && (
				<button type="button" onClick={onExpand} className={moreButton}>
					View {hidden} more {pluralize(hidden, "reply", "replies")}
				</button>
			)}
			{expanded && hasNextPage && (
				<button
					type="button"
					disabled={isFetchingNextPage}
					onClick={() => void fetchNextPage()}
					className={moreButton}
				>
					{isFetchingNextPage
						? "Loading replies"
						: `View ${hidden} more ${pluralize(hidden, "reply", "replies")}`}
				</button>
			)}
		</VStack>
	)
}
