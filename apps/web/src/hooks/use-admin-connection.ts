import type { TypedDocumentNode } from "@graphql-typed-document-node/core"
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { useState } from "react"
import {
	type Connection,
	gqlInfiniteQueryOptions,
} from "#/graphql/query-options"

// Sort+cursor pagination for the admin Data page's tables
// (leagues/teams/players/games). The sort lives in the query key, so picking
// a new one is a different cache entry and starts at page 1 on its own -
// which is the right behavior anyway, since a new order invalidates whatever
// cursor position was mid-scroll under the old one. `document`/`variables`/
// `selectConnection` are the only entity-specific parts.
export function useAdminConnection<TResult, TVariables, TItem, Sort extends string>({
	defaultSort,
	defaultDir = "asc",
	document,
	variables,
	selectConnection,
}: {
	defaultSort: Sort
	defaultDir?: "asc" | "desc"
	document: TypedDocumentNode<TResult, TVariables>
	variables: (args: {
		sortBy: Sort
		sortDir: "ASC" | "DESC"
	}) => Omit<TVariables, "after">
	selectConnection: (result: TResult) => Connection<TItem>
}) {
	const [sortBy, setSortBy] = useState(defaultSort)
	const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultDir)

	// keepPreviousData holds the current rows in place while the newly picked
	// sort's first page loads, rather than emptying the table mid-click.
	const { data, hasNextPage, isFetching, fetchNextPage, refetch } =
		useInfiniteQuery({
			...gqlInfiniteQueryOptions(
				document,
				variables({ sortBy, sortDir: sortDir === "asc" ? "ASC" : "DESC" }),
				selectConnection,
			),
			placeholderData: keepPreviousData,
		})

	function onSort(key: Sort) {
		if (key === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
		else {
			setSortBy(key)
			setSortDir("asc")
		}
	}

	return {
		items: data?.items ?? [],
		loading: isFetching,
		hasNextPage,
		sortBy,
		sortDir,
		onSort,
		// Zero-arg wrappers: these are wired straight to onClick/onSaved, and
		// the query client's own options argument has nothing to do with a
		// click event.
		loadMore: () => {
			fetchNextPage()
		},
		reload: () => {
			refetch()
		},
	}
}
