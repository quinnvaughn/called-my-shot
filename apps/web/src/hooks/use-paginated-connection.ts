import { useCallback, useEffect, useState } from "react"

type PageInfo = { hasNextPage: boolean; endCursor: string | null }
type Connection<T> = { items: T[]; pageInfo: PageInfo }

// Client-driven keyset pagination on top of a Relay-style Connection field.
// Seeds from a page already fetched elsewhere (e.g. a route loader) and
// appends subsequent pages on demand - pair with InfiniteScroll's
// onLoadMore.
export function usePaginatedConnection<T>(
	initial: Connection<T>,
	fetchPage: (after: string) => Promise<Connection<T>>,
) {
	const [items, setItems] = useState(initial.items)
	const [pageInfo, setPageInfo] = useState(initial.pageInfo)
	const [loading, setLoading] = useState(false)

	// initial comes from a route loader; when the loader reruns (e.g. after
	// router.invalidate()) it hands us a new items array with fresh server
	// state - resync to it rather than keeping whatever was seeded at mount.
	useEffect(() => {
		setItems(initial.items)
		setPageInfo(initial.pageInfo)
	}, [initial.items, initial.pageInfo])

	const loadMore = useCallback(async () => {
		if (loading || !pageInfo.hasNextPage || !pageInfo.endCursor) return
		setLoading(true)
		try {
			const page = await fetchPage(pageInfo.endCursor)
			setItems((prev) => [...prev, ...page.items])
			setPageInfo(page.pageInfo)
		} finally {
			setLoading(false)
		}
	}, [loading, pageInfo, fetchPage])

	return { items, hasNextPage: pageInfo.hasNextPage, loading, loadMore }
}
