import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { HStack, VStack } from "styled-system/jsx"
import {
	hasActiveFilters,
	QuestionFilterBar,
	type QuestionFilterValue,
} from "#/components/filters/question-filter-bar"
import { LiveCallsSection } from "#/components/my-calls/live-calls-section"
import { MyCallsTab } from "#/components/my-calls/my-calls-tab"
import { SortSwitcher } from "#/components/questions/sort-switcher"
import { ChipButton } from "#/components/ui/chip-button"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import {
	type MyCallsFilters,
	myCallCountsQuery,
	myCallsPageQuery,
	myCallsQuery,
	myLiveCallsQuery,
} from "#/graphql/queries/my-calls"
import { seedInfiniteQuery } from "#/graphql/query-options"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import {
	filtersFromSearch,
	filtersToSearch,
	type MyCallsKind,
	myCallsDirection,
	myCallsKind,
	myCallsScope,
	myCallsSort,
	myCallsTab,
	type MyCallsTab as TabValue,
	validateMyCallsSearch,
} from "#/lib/my-calls-search"
import { DEFAULT_MY_LIST_DIRECTION, MY_CALL_SORTS } from "#/lib/my-list-sorts"

export const Route = createFileRoute("/_app/_authed/my-calls")({
	component: RouteComponent,
	// Kind, tab, filters and sort all live in the URL (see lib/my-calls-search.ts),
	// so coming back to this page from a call lands on the list as it was left.
	validateSearch: validateMyCallsSearch,
	// Both tabs' first pages and the counts arrive as fields of one query (see
	// MyCallsPageDocument), so they're handed straight to the caches the page
	// reads from rather than costing a request each. Only the Games side is
	// preloaded, since that's where a bare /my-calls opens.
	//
	// Every seed key has to be exactly what the component asks for on its first
	// render, or the seed is dead and the page refetches what it just loaded.
	// That means seeding each tab under its own default sort and direction (the
	// component always sends both explicitly) rather than under neither - the
	// aliased query sends no sort arg and gets the server's per-tab default
	// back, which is the same ordering these two keys name.
	loader: async ({ context }) => {
		const data = await context.queryClient.query(myCallsPageQuery)
		seedInfiniteQuery(
			context.queryClient,
			myCallsQuery(
				"OPEN",
				{ scope: "GAME" },
				MY_CALL_SORTS.open.default,
				DEFAULT_MY_LIST_DIRECTION,
			),
			{ myCalls: data.open },
		)
		seedInfiniteQuery(
			context.queryClient,
			myCallsQuery(
				"RESOLVED",
				{ scope: "GAME" },
				MY_CALL_SORTS.resolved.default,
				DEFAULT_MY_LIST_DIRECTION,
			),
			{ myCalls: data.resolved },
		)
		context.queryClient.setQueryData(
			myCallCountsQuery({ scope: "GAME" }).queryKey,
			{
				myCallCounts: data.myCallCounts,
			},
		)
		context.queryClient.setQueryData(myLiveCallsQuery().queryKey, {
			myLiveCalls: data.myLiveCalls,
		})
	},
})

function RouteComponent() {
	const { leagues } = Route.useRouteContext()
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const kind = myCallsKind(search)
	const activeTab = myCallsTab(search)
	const filters = filtersFromSearch(search, leagues)
	const sort = myCallsSort(search)
	const direction = myCallsDirection(search)

	// replace rather than push: a filter change isn't a page of its own, so
	// Back from here still leaves My Calls instead of stepping through every
	// filter that was tried.
	function updateSearch(next: Partial<typeof search>) {
		navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
	}

	function setFilters(next: QuestionFilterValue) {
		updateSearch(filtersToSearch(next, leagues))
	}

	const debouncedSearch = useDebouncedValue(filters.search.trim(), 300)
	const queryFilters = toQueryFilters(filters, debouncedSearch, activeTab, kind)

	const { data: counts } = useQuery({
		...myCallCountsQuery(queryFilters),
		placeholderData: keepPreviousData,
	})

	// Each tab opens on its own default sort, so the sort params are dropped
	// rather than carried across.
	function selectTab(next: TabValue) {
		updateSearch({
			tab: next === "resolved" ? "resolved" : undefined,
			sort: undefined,
			dir: undefined,
		})
	}

	// Status, filters and sort carry across: the same league or search is
	// usually still what's wanted on the other side. Picked shapes the other
	// side can't hold are dropped by validateMyCallsSearch.
	function selectKind(next: MyCallsKind) {
		updateSearch({ kind: next === "season" ? "season" : undefined })
	}

	return (
		<VStack alignItems="stretch" gap="6">
			<PageHeader
				title="My Calls"
				subtitle="Every call you've made, open and resolved"
			/>

			<Tabs value={kind} onValueChange={selectKind}>
				<Tabs.List>
					<Tabs.Trigger value="game">Games</Tabs.Trigger>
					<Tabs.Trigger value="season">Season long</Tabs.Trigger>
				</Tabs.List>
			</Tabs>

			<QuestionFilterBar
				value={filters}
				onChange={setFilters}
				leagues={leagues}
				showResult={activeTab === "resolved"}
				showScope={false}
				shapeScope={myCallsScope(kind)}
				searchPlaceholder="Search your calls by question, player or team…"
			/>

			<HStack gap="2">
				<ChipButton
					selected={activeTab === "open"}
					pressed={activeTab === "open"}
					onClick={() => selectTab("open")}
				>
					Open ({counts?.myCallCounts.open ?? 0})
				</ChipButton>
				<ChipButton
					selected={activeTab === "resolved"}
					pressed={activeTab === "resolved"}
					onClick={() => selectTab("resolved")}
				>
					Resolved ({counts?.myCallCounts.resolved ?? 0})
				</ChipButton>
			</HStack>

			{/* Open game calls only: a resolved call's game finished long ago,
			and a season-long call hangs off no game, so there is never anything
			live to pin above those lists. */}
			{kind === "game" && activeTab === "open" && (
				<LiveCallsSection filters={queryFilters} divider />
			)}

			<SortSwitcher
				sorts={MY_CALL_SORTS[activeTab].options}
				active={sort}
				onChange={(next) =>
					updateSearch({
						sort: next === MY_CALL_SORTS[activeTab].default ? undefined : next,
					})
				}
				direction={direction}
				onDirectionChange={(next) =>
					updateSearch({
						dir: next === DEFAULT_MY_LIST_DIRECTION ? undefined : "asc",
					})
				}
			/>

			<MyCallsTab
				key={`${kind}-${activeTab}`}
				kind={kind}
				status={activeTab === "open" ? "OPEN" : "RESOLVED"}
				filters={queryFilters}
				sort={sort}
				direction={direction}
				filtered={hasActiveFilters(filters)}
			/>
		</VStack>
	)
}

// Drops anything unset so an untouched filter sends no variable at all, which
// is what keeps the opening state's query key identical to the one the loader
// seeded. `result` additionally only travels on the Resolved tab - the control
// is hidden on Open, and a hidden filter must not keep narrowing the list.
// Scope always travels, from the Games/Season tabs rather than the filter bar.
export function toQueryFilters(
	value: QuestionFilterValue,
	search: string,
	tab: TabValue,
	kind: MyCallsKind,
): MyCallsFilters {
	return {
		...(value.leagueId ? { leagueId: value.leagueId } : {}),
		...(value.shapes.length > 0 ? { shapes: value.shapes } : {}),
		...(search ? { search } : {}),
		scope: myCallsScope(kind),
		...(tab === "resolved" && value.result ? { result: value.result } : {}),
	}
}
