import { useCallback, useEffect, useRef, useState } from "react"

type PageInfo = { hasNextPage: boolean; endCursor: string | null }
type Page<T> = { items: T[]; pageInfo: PageInfo }

// Self-fetching sort+cursor pagination for the admin Data page's tables
// (leagues/teams/players/games) - unlike usePaginatedConnection (seeded from
// a route loader, append-only), this owns its own initial fetch and resets
// to page 1 whenever sort changes, since a new sort invalidates whatever
// cursor position was mid-scroll under the old order. `fetchPage` is the only
// entity-specific part - it wraps whichever GraphQL query/field/error-union
// shape the caller actually has.
export function useAdminConnection<T, Sort extends string>({
	defaultSort,
	defaultDir = "asc",
	fetchPage,
}: {
	defaultSort: Sort
	defaultDir?: "asc" | "desc"
	fetchPage: (args: {
		sortBy: Sort
		sortDir: "asc" | "desc"
		after: string | null
	}) => Promise<Page<T> | null>
}) {
	const [sortBy, setSortBy] = useState(defaultSort)
	const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultDir)
	const [items, setItems] = useState<T[]>([])
	const [pageInfo, setPageInfo] = useState<PageInfo>({
		hasNextPage: false,
		endCursor: null,
	})
	const [loading, setLoading] = useState(true)
	const fetchPageRef = useRef(fetchPage)
	fetchPageRef.current = fetchPage

	const load = useCallback(
		async (
			reset: boolean,
			sb: Sort,
			sd: "asc" | "desc",
			after: string | null,
		) => {
			setLoading(true)
			const page = await fetchPageRef.current({
				sortBy: sb,
				sortDir: sd,
				after,
			})
			setLoading(false)
			if (!page) return
			setItems((prev) => (reset ? page.items : [...prev, ...page.items]))
			setPageInfo(page.pageInfo)
		},
		[],
	)

	// Deliberately keyed only on sort - `load` is stable (its one real
	// dependency, fetchPage, is read via ref instead) and re-running this on
	// every render would re-fetch page 1 constantly.
	// biome-ignore lint/correctness/useExhaustiveDependencies: load is stable, see above
	useEffect(() => {
		load(true, sortBy, sortDir, null)
	}, [sortBy, sortDir])

	function onSort(key: Sort) {
		if (key === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
		else {
			setSortBy(key)
			setSortDir("asc")
		}
	}

	function loadMore() {
		if (!pageInfo.hasNextPage || loading) return
		load(false, sortBy, sortDir, pageInfo.endCursor)
	}

	function reload() {
		load(true, sortBy, sortDir, null)
	}

	return {
		items,
		loading,
		hasNextPage: pageInfo.hasNextPage,
		sortBy,
		sortDir,
		onSort,
		loadMore,
		reload,
	}
}
