import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import {
	EMPTY_FILTERS,
	hasActiveFilters,
	QuestionFilterBar,
	type QuestionFilterValue,
} from "#/components/filters/question-filter-bar"
import { LiveCallsSection } from "#/components/my-calls/live-calls-section"
import { MyCallsTab } from "#/components/my-calls/my-calls-tab"
import { SortSwitcher } from "#/components/questions/sort-switcher"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import type { CallSortOrder } from "#/graphql/generated/graphql"
import {
	type MyCallsFilters,
	myCallCountsQuery,
	myCallsPageQuery,
	myCallsQuery,
	myLiveCallsQuery,
} from "#/graphql/queries/my-calls"
import { seedInfiniteQuery } from "#/graphql/query-options"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { MY_CALL_SORTS } from "#/lib/my-list-sorts"

type TabValue = "open" | "resolved"

export const Route = createFileRoute("/_app/_authed/my-calls")({
	component: RouteComponent,
	// Both tabs' first pages and the counts arrive as fields of one query (see
	// MyCallsPageDocument), so they're handed straight to the caches the page
	// reads from rather than costing a request each.
	//
	// Every seed key has to be exactly what the component asks for on its first
	// render, or the seed is dead and the page refetches what it just loaded.
	// That means seeding each tab under its own default sort (the component
	// always sends one explicitly) rather than under no sort at all - the
	// aliased query sends no sort arg and gets the server's per-tab default
	// back, which is the same ordering these two keys name.
	loader: async ({ context }) => {
		const data = await context.queryClient.query(myCallsPageQuery)
		seedInfiniteQuery(
			context.queryClient,
			myCallsQuery("OPEN", {}, MY_CALL_SORTS.open.default),
			{ myCalls: data.open },
		)
		seedInfiniteQuery(
			context.queryClient,
			myCallsQuery("RESOLVED", {}, MY_CALL_SORTS.resolved.default),
			{ myCalls: data.resolved },
		)
		context.queryClient.setQueryData(myCallCountsQuery().queryKey, {
			myCallCounts: data.myCallCounts,
		})
		context.queryClient.setQueryData(myLiveCallsQuery().queryKey, {
			myLiveCalls: data.myLiveCalls,
		})
	},
})

function RouteComponent() {
	const { leagues } = Route.useRouteContext()
	const [activeTab, setActiveTab] = useState<TabValue>("open")
	const [filters, setFilters] = useState<QuestionFilterValue>(EMPTY_FILTERS)
	const [sort, setSort] = useState<CallSortOrder>(MY_CALL_SORTS.open.default)

	const debouncedSearch = useDebouncedValue(filters.search.trim(), 300)
	const queryFilters = toQueryFilters(filters, debouncedSearch, activeTab)

	const { data: counts } = useQuery({
		...myCallCountsQuery(queryFilters),
		placeholderData: keepPreviousData,
	})

	function selectTab(next: TabValue) {
		setActiveTab(next)
		setSort(MY_CALL_SORTS[next].default)
	}

	return (
		<VStack alignItems="stretch" gap="6">
			<PageHeader
				title="My Calls"
				subtitle="Every call you've made, open and resolved"
			/>

			<QuestionFilterBar
				value={filters}
				onChange={setFilters}
				leagues={leagues}
				showResult={activeTab === "resolved"}
				searchPlaceholder="Search your calls by question, player or team…"
			/>

			<Tabs value={activeTab} onValueChange={selectTab}>
				<Tabs.List>
					<Tabs.Trigger value="open">
						Open ({counts?.myCallCounts.open ?? 0})
					</Tabs.Trigger>
					<Tabs.Trigger value="resolved">
						Resolved ({counts?.myCallCounts.resolved ?? 0})
					</Tabs.Trigger>
				</Tabs.List>
			</Tabs>

			<SortSwitcher
				sorts={MY_CALL_SORTS[activeTab].options}
				active={sort}
				onChange={setSort}
			/>

			{/* Open tab only: a resolved call's game finished long ago, so
			there is never anything live to pin above that list. */}
			{activeTab === "open" && <LiveCallsSection filters={queryFilters} />}

			<MyCallsTab
				key={activeTab}
				status={activeTab === "open" ? "OPEN" : "RESOLVED"}
				filters={queryFilters}
				sort={sort}
				filtered={hasActiveFilters(filters)}
			/>
		</VStack>
	)
}

// Drops anything unset so an untouched filter sends no variable at all, which
// is what keeps the opening state's query key identical to the one the loader
// seeded. `result` additionally only travels on the Resolved tab - the control
// is hidden on Open, and a hidden filter must not keep narrowing the list.
export function toQueryFilters(
	value: QuestionFilterValue,
	search: string,
	tab: TabValue,
): MyCallsFilters {
	return {
		...(value.leagueId ? { leagueId: value.leagueId } : {}),
		...(value.shapes.length > 0 ? { shapes: value.shapes } : {}),
		...(search ? { search } : {}),
		...(value.scope ? { scope: value.scope } : {}),
		...(tab === "resolved" && value.result ? { result: value.result } : {}),
	}
}
