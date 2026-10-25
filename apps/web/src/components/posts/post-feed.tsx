// Any feed of posts (Home, a space, a group, a profile, a prompt's answers):
// one PostCard each, the next page loading as the end scrolls into view.
import { useInfiniteQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import type { PostFeedQuery } from "#/graphql/posts/queries"
import { PostCard } from "./post-card"

export function PostFeed({
	query,
	empty,
}: {
	query: PostFeedQuery
	empty: ReactNode
}) {
	const { data, hasNextPage, isPending, isFetchingNextPage, fetchNextPage } =
		useInfiniteQuery(query)

	return (
		<InfiniteScroll
			items={data?.items ?? []}
			getKey={(post) => post.id}
			hasNextPage={hasNextPage}
			loading={isPending || isFetchingNextPage}
			onLoadMore={fetchNextPage}
			emptyState={empty}
			renderItem={(post) => <PostCard post={post} />}
		/>
	)
}
