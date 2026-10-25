import { useQueryClient } from "@tanstack/react-query"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidatePosts,
	LikePostDocument,
	UnlikePostDocument,
} from "#/graphql/posts/mutations"
import { useLikeToggle } from "./use-like-toggle"

// The like on a post, wherever it's shown: its page or a feed card.
export function usePostLike(post: {
	id: string
	likeCount: number
	viewerLiked: boolean
}) {
	const queryClient = useQueryClient()
	const like = useGqlMutation(LikePostDocument)
	const unlike = useGqlMutation(UnlikePostDocument)
	return useLikeToggle(
		{ liked: post.viewerLiked, count: post.likeCount },
		async (next) => {
			await (next
				? like.mutateAsync({ postId: post.id })
				: unlike.mutateAsync({ postId: post.id }))
			await invalidatePosts(queryClient)
		},
	)
}
