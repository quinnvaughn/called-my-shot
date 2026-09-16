import type { TypedDocumentNode } from "@graphql-typed-document-node/core"
import {
	type InfiniteData,
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	type UseInfiniteQueryOptions,
	type UseQueryOptions,
} from "@tanstack/react-query"
import { getOperationName, gqlFetch } from "./fetcher"

// SSR has to forward the browser's session cookie, but the queryFn is called
// by the query client rather than by us, so there's nowhere to pass it in.
// Instead the per-request client created in router.tsx carries it as default
// query meta; typing it here rather than casting at the read site.
declare module "@tanstack/react-query" {
	interface Register {
		queryMeta: { cookie?: string }
	}
}

export function gqlQueryKey<TResult, TVariables>(
	document: TypedDocumentNode<TResult, TVariables>,
	variables: TVariables,
) {
	return [getOperationName(document), variables] as const
}

type QueryOverrides<TResult> = Partial<
	Omit<UseQueryOptions<TResult, Error, TResult>, "queryKey" | "queryFn">
> & {
	// false for a query that opens with a modal. React-query cancels a query
	// whenever a newer fetch supersedes it or its last observer goes away (the
	// modal closing), and that abort reaches the dev server as a closed socket
	// mid-request, which Nitro surfaces as an unhandled `aborted` in Vite's
	// error overlay. Route preloads and paginated feeds are cancelled
	// constantly and should be, so they keep the default.
	abortable?: boolean
}

/**
 * The same object drives a route loader (`queryClient.query`), the component
 * that renders it (`useSuspenseQuery`), and any imperative read - which is
 * what keeps a loader's prefetch and a component's read pointed at one cache
 * entry instead of two.
 */
export function gqlQueryOptions<TResult, TVariables>(
	document: TypedDocumentNode<TResult, TVariables>,
	variables: TVariables,
	{ abortable = true, ...overrides }: QueryOverrides<TResult> = {},
) {
	return queryOptions({
		queryKey: gqlQueryKey(document, variables),
		queryFn: ({ signal, meta }) =>
			gqlFetch(document, variables, {
				cookie: meta?.cookie,
				signal: abortable ? signal : undefined,
			}),
		...overrides,
	})
}

type PageInfo = { hasNextPage: boolean; endCursor: string | null }
export type Connection<TItem> = { items: readonly TItem[]; pageInfo: PageInfo }

/**
 * Stand-in for the error branch of a connection's result union - a caller
 * that can't reach its `{ items, pageInfo }` renders an empty list rather
 * than a half-built one.
 */
export const EMPTY_CONNECTION: Connection<never> = {
	items: [],
	pageInfo: { hasNextPage: false, endCursor: null },
}

/** Cursor pages are addressed by `after`; the first page passes null. */
export type PageParam = string | null

type InfiniteOverrides<TResult, TItem> = Partial<
	Omit<
		UseInfiniteQueryOptions<
			TResult,
			Error,
			{ items: TItem[]; pages: TResult[] },
			readonly unknown[],
			PageParam
		>,
		"queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam" | "select"
	>
> & {
	// Same escape hatch as gqlQueryOptions', and for the same reason - see the
	// comment there. A paginated feed normally wants the default: its fetches
	// are superseded constantly (every keystroke in a search box) and
	// cancelling those is the point. Set this false only for a list that
	// unmounts while a fetch can still be in flight - a list inside a tab or a
	// modal - where the cancel isn't a superseded fetch but the observer going
	// away, and the only thing it produces is a dev-server `aborted` overlay.
	abortable?: boolean
}

/**
 * Relay-style keyset pagination over a connection field. `selectConnection`
 * is the only per-query part: it digs the `{ items, pageInfo }` out of
 * whichever field name and result union the query actually returns, and
 * supplies the empty fallback when the union is an error case.
 *
 * `select` hands back both the flattened items (what a list renders) and the
 * raw pages (for sibling fields that ride along on the response, like the
 * leaderboard's viewer entry).
 */
export function gqlInfiniteQueryOptions<TResult, TVariables, TItem>(
	document: TypedDocumentNode<TResult, TVariables>,
	variables: Omit<TVariables, "after">,
	selectConnection: (result: TResult) => Connection<TItem>,
	{ abortable = true, ...overrides }: InfiniteOverrides<TResult, TItem> = {},
) {
	return infiniteQueryOptions({
		queryKey: [getOperationName(document), variables, "infinite"] as const,
		queryFn: ({ pageParam, signal, meta }) =>
			gqlFetch(document, { ...variables, after: pageParam } as TVariables, {
				cookie: meta?.cookie,
				signal: abortable ? signal : undefined,
			}),
		initialPageParam: null as PageParam,
		getNextPageParam: (lastPage: TResult) => {
			const { pageInfo } = selectConnection(lastPage)
			return pageInfo.hasNextPage
				? (pageInfo.endCursor ?? undefined)
				: undefined
		},
		select: (data: InfiniteData<TResult, PageParam>) => ({
			items: data.pages.flatMap((page) => [...selectConnection(page).items]),
			pages: data.pages,
		}),
		...overrides,
	})
}

/**
 * Several routes fetch the first page of two or three lists as aliased fields
 * of one combined query, so the whole page preloads in a single round trip
 * (see graphql/queries/my-calls.ts). That first page arrives under the
 * combined query's shape, not the per-list one the infinite query paginates
 * with, so hand it over directly rather than splitting those documents and
 * paying a request per list.
 */
export function seedInfiniteQuery<TResult>(
	queryClient: QueryClient,
	options: { queryKey: readonly unknown[] },
	firstPage: TResult,
) {
	queryClient.setQueryData<InfiniteData<TResult, PageParam>>(
		options.queryKey,
		(existing) =>
			existing ?? { pages: [firstPage], pageParams: [null as PageParam] },
	)
}
