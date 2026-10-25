// Reads for posts and their prompts: every feed a PostFeed renders, a post's
// page and thread, a prompt's page, and what the Rushmore composer searches.
import type { TypedDocumentNode } from "@graphql-typed-document-node/core"
import { infiniteQueryOptions } from "@tanstack/react-query"
import { getOperationName, gqlFetch } from "#/graphql/fetcher"
import { type FragmentType, graphql } from "#/graphql/generated"
import type {
	AnswerSort,
	CommentSort,
	SpaceKind,
} from "#/graphql/generated/graphql"
import {
	type Connection,
	EMPTY_CONNECTION,
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
	type PageParam,
} from "#/graphql/query-options"

// A post as every feed lists it. The kind's own card takes it from here
// (see components/posts/post-card.tsx).
export const PostCardFragment = graphql(`
	fragment PostCard_post on Post {
		__typename
		id
		...RushmorePostCard_post
	}
`)

graphql(`
	fragment PostFeed_connection on PostConnection {
		items {
			id
			...PostCard_post
		}
		pageInfo {
			hasNextPage
			endCursor
		}
	}
`)

export type PostFeedItem = { id: string } & FragmentType<
	typeof PostCardFragment
>

export const FEED_PAGE_SIZE = 10

/**
 * Every feed comes back under a different field (homeFeed, group.posts,
 * prompt.answers), so each page is narrowed to its connection as it lands.
 * That keeps one cached shape across feeds and lets PostFeed take any of
 * them. The key matches gqlInfiniteQueryOptions', so invalidating a feed's
 * document by name still reaches it.
 */
function postFeedOptions<TResult, TVariables>(
	document: TypedDocumentNode<TResult, TVariables>,
	variables: Omit<TVariables, "after">,
	selectConnection: (result: TResult) => Connection<PostFeedItem>,
) {
	return infiniteQueryOptions({
		// Widened so every feed's options share one type, whatever its
		// variables.
		queryKey: [
			getOperationName(document),
			variables,
			"infinite",
		] as readonly unknown[],
		queryFn: async ({ pageParam, signal, meta }) =>
			selectConnection(
				await gqlFetch(
					document,
					{ ...variables, after: pageParam } as TVariables,
					{ cookie: meta?.cookie, signal },
				),
			),
		initialPageParam: null as PageParam,
		getNextPageParam: (lastPage: Connection<PostFeedItem>) =>
			lastPage.pageInfo.hasNextPage
				? (lastPage.pageInfo.endCursor ?? undefined)
				: undefined,
		select: (data) => ({
			items: data.pages.flatMap((page) => [...page.items]),
			pages: data.pages,
		}),
	})
}

export type PostFeedQuery = ReturnType<typeof postFeedOptions>

export const HomeFeedDocument = graphql(`
	query HomeFeed($first: Int, $after: String) {
		homeFeed(first: $first, after: $after) {
			...PostFeed_connection @unmask
		}
	}
`)

export const homeFeedQuery = () =>
	postFeedOptions(
		HomeFeedDocument,
		{ first: FEED_PAGE_SIZE },
		(result) => result.homeFeed,
	)

export const SpaceFeedDocument = graphql(`
	query SpaceFeed($kind: SpaceKind!, $id: ID!, $first: Int, $after: String) {
		spaceFeed(kind: $kind, id: $id, first: $first, after: $after) {
			...PostFeed_connection @unmask
		}
	}
`)

export const spaceFeedQuery = ({ kind, id }: { kind: SpaceKind; id: string }) =>
	postFeedOptions(
		SpaceFeedDocument,
		{ kind, id, first: FEED_PAGE_SIZE },
		(result) => result.spaceFeed,
	)

export const GroupPostsDocument = graphql(`
	query GroupPosts($groupId: ID!, $first: Int, $after: String) {
		group(id: $groupId) {
			id
			posts(first: $first, after: $after) {
				...PostFeed_connection @unmask
			}
		}
	}
`)

export const groupPostsQuery = (groupId: string) =>
	postFeedOptions(
		GroupPostsDocument,
		{ groupId, first: FEED_PAGE_SIZE },
		(result) => result.group?.posts ?? EMPTY_CONNECTION,
	)

export const UserPostsDocument = graphql(`
	query UserPosts($username: String!, $first: Int, $after: String) {
		userByUsername(username: $username) {
			id
			posts(first: $first, after: $after) {
				...PostFeed_connection @unmask
			}
		}
	}
`)

export const userPostsQuery = (username: string) =>
	postFeedOptions(
		UserPostsDocument,
		{ username, first: FEED_PAGE_SIZE },
		(result) => result.userByUsername?.posts ?? EMPTY_CONNECTION,
	)

export const PromptAnswersDocument = graphql(`
	query PromptAnswers(
		$code: String!
		$sort: AnswerSort
		$first: Int
		$after: String
	) {
		prompt(code: $code) {
			id
			answers(sort: $sort, first: $first, after: $after) {
				...PostFeed_connection @unmask
			}
		}
	}
`)

export const promptAnswersQuery = ({
	code,
	sort,
}: {
	code: string
	sort: AnswerSort
}) =>
	postFeedOptions(
		PromptAnswersDocument,
		{ code, sort, first: FEED_PAGE_SIZE },
		(result) => result.prompt?.answers ?? EMPTY_CONNECTION,
	)

export const PopularRushmoresDocument = graphql(`
	query PopularRushmores($first: Int, $after: String) {
		popularRushmores(first: $first, after: $after) {
			...PostFeed_connection @unmask
		}
	}
`)

export const popularRushmoresQuery = () =>
	postFeedOptions(
		PopularRushmoresDocument,
		{ first: FEED_PAGE_SIZE },
		(result) => result.popularRushmores,
	)

// A Rushmore's page: the four faces, the words, who posted it and where, and
// the franchise color its band is drawn in.
export const PostPageDocument = graphql(`
	query PostPage($postId: ID!) {
		gifsEnabled
		post(id: $postId) {
			__typename
			id
			createdAt
			editedAt
			body
			removed
			likeCount
			viewerLiked
			commentCount
			viewerIsAuthor
			viewerCanComment
			shareCode
			sharePath
			author {
				id
				username
				name
				avatarUrl
			}
			group {
				id
				name
				logoUrl
			}
			... on RushmorePost {
				prompt {
					id
					code
					title
					color
					answerCount
					isFranchise
					viewerAnswer {
						id
						... on RushmorePost {
							picks {
								player {
									id
									name
								}
							}
						}
					}
					league {
						id
						slug
						abbreviation
					}
					team {
						id
						name
						abbreviation
						color
					}
				}
				picks {
					position
					sharePercent
					player {
						id
						name
						portraitUrl
						headshotUrl
					}
				}
			}
		}
	}
`)

export const postPageQuery = (postId: string) =>
	gqlQueryOptions(PostPageDocument, { postId })

// Someone's public Rushmore for a prompt, by username: what the address on
// its share image, /rushmore/{code}/{username}, opens.
export const PromptPublicAnswerDocument = graphql(`
	query PromptPublicAnswer($code: String!, $username: String!) {
		prompt(code: $code) {
			id
			publicAnswerBy(username: $username) {
				id
			}
		}
	}
`)

export const promptPublicAnswerQuery = (code: string, username: string) =>
	gqlQueryOptions(PromptPublicAnswerDocument, { code, username })

// A prompt's page and its consensus card: the four players on the most
// answers, how many answers there are, and whether the viewer has posted one
// for everyone.
export const PromptPageDocument = graphql(`
	query PromptPage($code: String!) {
		prompt(code: $code) {
			id
			code
			title
			color
			answerCount
			isFranchise
			positions
			fromYear
			toYear
			league {
				id
				slug
				name
				abbreviation
			}
			team {
				id
				name
				abbreviation
				color
				logoUrl
			}
			creator {
				id
				username
				name
				avatarUrl
			}
			consensus {
				count
				sharePercent
				player {
					id
					name
					portraitUrl
					headshotUrl
				}
			}
			viewerAnswer {
				id
			}
		}
	}
`)

export const promptPageQuery = (code: string) =>
	gqlQueryOptions(PromptPageDocument, { code })

graphql(`
	fragment PostComment_comment on Comment {
		id
		createdAt
		removed
		text
		gif {
			url
			width
			height
			alt
		}
		sender {
			id
			username
			name
			avatarUrl
		}
		parentId
		likeCount
		viewerLiked
		replyTo {
			id
			username
			name
			avatarUrl
		}
	}
`)

export const COMMENTS_PAGE_SIZE = 20

// A page of the thread's top-level comments, each with its first replies
// and how many there are in all.
export const PostCommentsDocument = graphql(`
	query PostComments(
		$postId: ID!
		$sort: CommentSort
		$first: Int
		$after: String
	) {
		post(id: $postId) {
			id
			comments(sort: $sort, first: $first, after: $after) {
				items {
					...PostComment_comment @unmask
					replyCount
					replies {
						items {
							...PostComment_comment @unmask
						}
					}
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
`)

export const postCommentsQuery = ({
	postId,
	sort,
}: {
	postId: string
	sort: CommentSort
}) =>
	gqlInfiniteQueryOptions(
		PostCommentsDocument,
		{ postId, sort, first: COMMENTS_PAGE_SIZE },
		(result) => result.post?.comments ?? EMPTY_CONNECTION,
	)

export const REPLIES_PAGE_SIZE = 20

// The replies under one comment past the ones shown inline, oldest first.
export const PostCommentRepliesDocument = graphql(`
	query PostCommentReplies(
		$postId: ID!
		$commentId: ID!
		$first: Int
		$after: String
	) {
		post(id: $postId) {
			id
			comment(id: $commentId) {
				id
				replies(first: $first, after: $after) {
					items {
						...PostComment_comment @unmask
					}
					pageInfo {
						hasNextPage
						endCursor
					}
				}
			}
		}
	}
`)

// Read from the first reply, so once a comment's replies are opened this
// list replaces the inline few rather than continuing after them.
export const postCommentRepliesQuery = ({
	postId,
	commentId,
}: {
	postId: string
	commentId: string
}) =>
	gqlInfiniteQueryOptions(
		PostCommentRepliesDocument,
		{ postId, commentId, first: REPLIES_PAGE_SIZE },
		(result) => result.post?.comment?.replies ?? EMPTY_CONNECTION,
	)
