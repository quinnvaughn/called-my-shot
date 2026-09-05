import { type ReactNode, useEffect, useRef } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

type InfiniteScrollProps<T> = {
	items: T[]
	getKey: (item: T) => string
	renderItem: (item: T) => ReactNode
	hasNextPage: boolean
	loading: boolean
	onLoadMore: () => void
	emptyState?: ReactNode
}

// Generic vertical list with a sentinel at the bottom that triggers
// onLoadMore when it scrolls into view. Data fetching/pagination state lives
// with the caller (a useInfiniteQuery, see graphql/query-options.ts) - this
// only knows how to render items and ask for more.
export function InfiniteScroll<T>({
	items,
	getKey,
	renderItem,
	hasNextPage,
	loading,
	onLoadMore,
	emptyState,
}: InfiniteScrollProps<T>) {
	const sentinelRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!hasNextPage || loading) return
		const el = sentinelRef.current
		if (!el) return

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onLoadMore()
			},
			{ rootMargin: "200px" },
		)
		observer.observe(el)
		return () => observer.disconnect()
	}, [hasNextPage, loading, onLoadMore])

	if (items.length === 0 && !loading) {
		return emptyState ?? null
	}

	return (
		<VStack gap="3" alignItems="stretch">
			{items.map((item) => (
				<div key={getKey(item)}>{renderItem(item)}</div>
			))}
			{hasNextPage && <div ref={sentinelRef} />}
			{loading && (
				<p
					className={css({
						textAlign: "center",
						fontSize: "xs",
						fontFamily: "mono",
						color: "fg.muted",
						padding: "3",
					})}
				>
					Loading...
				</p>
			)}
		</VStack>
	)
}
