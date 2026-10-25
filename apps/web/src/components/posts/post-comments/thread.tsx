import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import type { CommentSort } from "#/graphql/generated/graphql"
import { postCommentsQuery } from "#/graphql/posts/queries"
import { useMe } from "#/hooks/use-me"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { pluralize } from "#/lib/pluralize"
import { CommentItem } from "./comment-item"
import { PostCommentComposer } from "./post-comment-composer"
import { SortToggle } from "./sort-toggle"

type Props = {
	postId: string
	commentCount: number
	canComment: boolean
	gifsEnabled: boolean
}

// A post's comments, YouTube-style: the box for a new comment up top, then
// top-level comments by most liked or newest, each with its replies under it.
export function PostCommentThread({
	postId,
	commentCount,
	canComment,
	gifsEnabled,
}: Props) {
	const me = useMe()
	const requireAuth = useRequireAuth()
	const [sort, setSort] = useState<CommentSort>("TOP")
	const { data, hasNextPage, isPending, isFetchingNextPage, fetchNextPage } =
		useInfiniteQuery({
			...postCommentsQuery({ postId, sort }),
			// Switching the sort keeps the comments on screen until the other
			// order is in.
			placeholderData: keepPreviousData,
		})

	return (
		<VStack id="comments" gap="4" alignItems="stretch">
			<HStack justify="space-between" gap="3" flexWrap="wrap">
				<h2 className={css({ textStyle: "sectionHeading", color: "fg.muted" })}>
					{commentCount} {pluralize(commentCount, "comment")}
				</h2>
				<SortToggle value={sort} onChange={setSort} />
			</HStack>
			{canComment ? (
				<PostCommentComposer
					postId={postId}
					gifsEnabled={gifsEnabled}
					placeholder="Add a comment"
				/>
			) : (
				!me && (
					<Button
						variant="outline"
						onClick={() =>
							requireAuth(() => {}, {
								signup: { title: "Sign up to comment" },
							})
						}
					>
						Sign up to comment
					</Button>
				)
			)}
			<InfiniteScroll
				items={data?.items ?? []}
				getKey={(comment) => comment.id}
				hasNextPage={hasNextPage}
				loading={isPending || isFetchingNextPage}
				onLoadMore={fetchNextPage}
				emptyState={
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						Nobody has commented yet.
					</p>
				}
				renderItem={(comment) => (
					<CommentItem
						postId={postId}
						comment={comment}
						canComment={canComment}
						gifsEnabled={gifsEnabled}
					/>
				)}
			/>
		</VStack>
	)
}
