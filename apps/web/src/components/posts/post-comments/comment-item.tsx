import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { CommentRow } from "./comment-row"
import { PostCommentComposer } from "./post-comment-composer"
import { ReplyList } from "./reply-list"
import type { CommentFields, ReplyTarget, ThreadComment } from "./types"

type Props = {
	postId: string
	comment: ThreadComment
	canComment: boolean
	gifsEnabled: boolean
}

// A top-level comment with its replies under it, and the reply box that
// opens under them when someone taps Reply.
export function CommentItem({
	postId,
	comment,
	canComment,
	gifsEnabled,
}: Props) {
	const [replying, setReplying] = useState<ReplyTarget | null>(null)
	const [expanded, setExpanded] = useState(false)

	function replyTo(reply: CommentFields | null) {
		setReplying({
			mention: reply
				? { id: reply.sender.id, username: reply.sender.username }
				: null,
		})
	}

	const mention = replying?.mention ?? null

	return (
		<VStack gap="3" alignItems="stretch">
			<CommentRow
				comment={comment}
				onReply={canComment ? () => replyTo(null) : undefined}
			/>
			<div className={css({ paddingInlineStart: "11" })}>
				<VStack gap="3" alignItems="stretch">
					<ReplyList
						postId={postId}
						comment={comment}
						expanded={expanded}
						onExpand={() => setExpanded(true)}
						onReply={canComment ? (reply) => replyTo(reply) : undefined}
					/>
					{replying && (
						<PostCommentComposer
							// A new target is a new box, so the text typed for one
							// person doesn't carry over to another.
							key={mention?.id ?? "parent"}
							postId={postId}
							gifsEnabled={gifsEnabled}
							placeholder={`Reply to @${mention?.username ?? comment.sender.username}`}
							reply={{
								parentId: comment.id,
								mentionUserId: mention?.id ?? null,
							}}
							autoFocus
							onCancel={() => setReplying(null)}
							onSent={() => {
								setReplying(null)
								setExpanded(true)
							}}
						/>
					)}
				</VStack>
			</div>
		</VStack>
	)
}
