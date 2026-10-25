import { useQueryClient } from "@tanstack/react-query"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidatePostThread,
	LikeCommentDocument,
	UnlikeCommentDocument,
} from "#/graphql/posts/mutations"
import { useLikeToggle } from "./use-like-toggle"

// The like on a comment in a post's thread. Likes order the thread under Top.
export function useCommentLike(comment: {
	id: string
	likeCount: number
	viewerLiked: boolean
}) {
	const queryClient = useQueryClient()
	const like = useGqlMutation(LikeCommentDocument)
	const unlike = useGqlMutation(UnlikeCommentDocument)
	return useLikeToggle(
		{ liked: comment.viewerLiked, count: comment.likeCount },
		async (next) => {
			await (next
				? like.mutateAsync({ commentId: comment.id })
				: unlike.mutateAsync({ commentId: comment.id }))
			await invalidatePostThread(queryClient)
		},
	)
}
