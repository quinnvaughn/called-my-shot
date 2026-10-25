import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import { invalidateOperations } from "#/graphql/query-options"
import {
	GroupPostsDocument,
	HomeFeedDocument,
	PopularRushmoresDocument,
	PostCommentRepliesDocument,
	PostCommentsDocument,
	PostPageDocument,
	PromptAnswersDocument,
	PromptPageDocument,
	SpaceFeedDocument,
	UserPostsDocument,
} from "./queries"

export const CreateRushmorePromptDocument = graphql(`
	mutation CreateRushmorePrompt($input: CreateRushmorePromptInput!) {
		createRushmorePrompt(input: $input) {
			__typename
			... on RushmorePromptPayload {
				prompt {
					id
					code
				}
			}
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const CreateRushmoreDocument = graphql(`
	mutation CreateRushmore($input: CreateRushmoreInput!) {
		createRushmore(input: $input) {
			__typename
			... on PostPayload {
				post {
					id
				}
			}
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const UpdateRushmoreDocument = graphql(`
	mutation UpdateRushmore($input: UpdateRushmoreInput!) {
		updateRushmore(input: $input) {
			__typename
			... on PostPayload {
				post {
					id
				}
			}
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const DeletePostDocument = graphql(`
	mutation DeletePost($postId: ID!) {
		deletePost(postId: $postId) {
			__typename
			... on DeletePostPayload {
				deletedPostId
			}
			... on Error {
				message
			}
		}
	}
`)

export const ReportPostDocument = graphql(`
	mutation ReportPost($input: ReportPostInput!) {
		reportPost(input: $input) {
			__typename
			... on PostReportPayload {
				report {
					id
				}
			}
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const SendPostCommentDocument = graphql(`
	mutation SendPostComment($input: SendPostCommentInput!) {
		sendPostComment(input: $input) {
			__typename
			... on PostCommentPayload {
				comment {
					id
				}
			}
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const LikePostDocument = graphql(`
	mutation LikePost($postId: ID!) {
		likePost(postId: $postId) {
			__typename
			... on PostPayload {
				post {
					id
					likeCount
					viewerLiked
				}
			}
			... on Error {
				message
			}
		}
	}
`)

export const UnlikePostDocument = graphql(`
	mutation UnlikePost($postId: ID!) {
		unlikePost(postId: $postId) {
			__typename
			... on PostPayload {
				post {
					id
					likeCount
					viewerLiked
				}
			}
			... on Error {
				message
			}
		}
	}
`)

export const LikeCommentDocument = graphql(`
	mutation LikeComment($commentId: ID!) {
		likeComment(commentId: $commentId) {
			__typename
			... on PostCommentPayload {
				comment {
					id
					likeCount
					viewerLiked
				}
			}
			... on Error {
				message
			}
		}
	}
`)

export const UnlikeCommentDocument = graphql(`
	mutation UnlikeComment($commentId: ID!) {
		unlikeComment(commentId: $commentId) {
			__typename
			... on PostCommentPayload {
				comment {
					id
					likeCount
					viewerLiked
				}
			}
			... on Error {
				message
			}
		}
	}
`)

// The first thing a failed post mutation has to say: a field's message
// over the union's general one.
export function postErrorMessage(
	result:
		| {
				__typename: string
				message?: string
				fieldErrors?: { message: string }[]
		  }
		| null
		| undefined,
): string {
	return (
		result?.fieldErrors?.[0]?.message ??
		result?.message ??
		"Something went wrong. Try again."
	)
}

// Every read that lists or shows a post, for after one is made, edited,
// liked or removed.
const POST_DOCUMENTS = [
	HomeFeedDocument,
	SpaceFeedDocument,
	GroupPostsDocument,
	UserPostsDocument,
	PromptAnswersDocument,
	PopularRushmoresDocument,
	PostPageDocument,
	PromptPageDocument,
]

export function invalidatePosts(queryClient: QueryClient) {
	return invalidateOperations(queryClient, POST_DOCUMENTS)
}

// A post's thread, its page (the comment count), and the feeds' counts.
export function invalidatePostThread(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		PostCommentsDocument,
		PostCommentRepliesDocument,
		...POST_DOCUMENTS,
	])
}
