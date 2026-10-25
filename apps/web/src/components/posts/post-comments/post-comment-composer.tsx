import { useQueryClient } from "@tanstack/react-query"
import { CommentComposer } from "#/components/comments/comment-composer"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidatePostThread,
	postErrorMessage,
	SendPostCommentDocument,
} from "#/graphql/posts/mutations"

type Props = {
	postId: string
	gifsEnabled: boolean
	placeholder: string
	// Set for a reply box: the top-level comment it goes under, and who it
	// @mentions when it answers a reply.
	reply?: { parentId: string; mentionUserId: string | null }
	autoFocus?: boolean
	onSent?: () => void
	// A reply box's Cancel.
	onCancel?: () => void
}

// A comment box on a post's thread: the one at the top, or a reply box
// opened under a comment. Thread-style (see CommentComposer's layout).
export function PostCommentComposer({
	postId,
	gifsEnabled,
	placeholder,
	reply,
	autoFocus,
	onSent,
	onCancel,
}: Props) {
	const queryClient = useQueryClient()
	const send = useGqlMutation(SendPostCommentDocument)
	return (
		<CommentComposer
			gifsEnabled={gifsEnabled}
			placeholder={placeholder}
			pending={send.isPending}
			autoFocus={autoFocus}
			layout="box"
			// The one at the top stays compact; a reply box opened to write in
			// gets room.
			rows={reply ? 3 : 2}
			submitLabel={reply ? "Reply" : "Comment"}
			onCancel={onCancel}
			onSubmit={async (draft) => {
				const result = (
					await send.mutateAsync({
						input: {
							postId,
							parentId: reply?.parentId,
							replyToUserId: reply?.mentionUserId ?? undefined,
							...draft,
						},
					})
				)?.sendPostComment
				if (result?.__typename !== "PostCommentPayload") {
					return postErrorMessage(result)
				}
				await invalidatePostThread(queryClient)
				onSent?.()
				return null
			}}
		/>
	)
}
