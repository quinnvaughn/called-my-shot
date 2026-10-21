import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiPlus } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import {
	EMPTY_FILTERS,
	hasActiveFilters,
	QuestionFilterBar,
	type QuestionFilterValue,
} from "#/components/filters/question-filter-bar"
import { MyQuestionsTab } from "#/components/my-questions/my-questions-tab"
import { SortSwitcher } from "#/components/questions/sort-switcher"
import { button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import type { MyQuestionSort, SortDirection } from "#/graphql/generated/graphql"
import {
	type MyQuestionsFilters,
	myQuestionsQuery,
} from "#/graphql/my-questions/queries"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import {
	DEFAULT_MY_LIST_DIRECTION,
	DEFAULT_MY_QUESTIONS_SORT,
	MY_QUESTION_SORTS,
} from "#/lib/my-list-sorts"
import { pluralize } from "#/lib/pluralize"

export const Route = createFileRoute("/_app/_authed/my-questions")({
	component: RouteComponent,
	// Prefetched under exactly the key the component asks for on its first
	// render - the sort and direction have to be passed explicitly here even though it's the
	// server's default too, because the component always sends one and a key
	// that differs by so much as an absent variable is a different cache entry
	// and a wasted round trip. Any filter or re-sort past that fetches normally.
	loader: ({ context }) =>
		context.queryClient.infiniteQuery(
			myQuestionsQuery(
				{},
				DEFAULT_MY_QUESTIONS_SORT,
				DEFAULT_MY_LIST_DIRECTION,
			),
		),
})

function RouteComponent() {
	const { leagues } = Route.useRouteContext()
	const [filters, setFilters] = useState<QuestionFilterValue>(EMPTY_FILTERS)
	const [sort, setSort] = useState<MyQuestionSort>(DEFAULT_MY_QUESTIONS_SORT)
	const [direction, setDirection] = useState<SortDirection>(
		DEFAULT_MY_LIST_DIRECTION,
	)

	const debouncedSearch = useDebouncedValue(filters.search.trim(), 300)
	const queryFilters = toQueryFilters(filters, debouncedSearch)

	// Same query key the tab below renders off, so this shares its cache entry
	// rather than costing a second request - it's read here only because the
	// count belongs in the header, above the list that produces it.
	const { data } = useInfiniteQuery({
		...myQuestionsQuery(queryFilters, sort, direction),
		placeholderData: keepPreviousData,
	})
	const total = data?.pages[0]?.myQuestions.totalCount ?? null

	return (
		<VStack alignItems="stretch" gap="6">
			<PageHeader
				title="My Questions"
				subtitle={subtitle(total)}
				action={
					<Link
						to="/new-question"
						className={button({ variant: "solid", size: "sm" })}
						aria-label="New question"
					>
						{/* Shortened on a phone, where the full label beside the title
						    leaves "My Questions" too narrow to fit on one line. */}
						<span
							className={css({
								display: { base: "flex", sm: "none" },
								alignItems: "center",
								gap: "1",
							})}
						>
							<FiPlus aria-hidden />
							New
						</span>
						<span className={css({ display: { base: "none", sm: "inline" } })}>
							New question
						</span>
					</Link>
				}
			/>

			<QuestionFilterBar
				value={filters}
				onChange={setFilters}
				leagues={leagues}
				searchPlaceholder="Search your questions by title, player or team…"
			/>

			<SortSwitcher
				sorts={MY_QUESTION_SORTS}
				active={sort}
				onChange={setSort}
				direction={direction}
				onDirectionChange={setDirection}
			/>

			<MyQuestionsTab
				filters={queryFilters}
				sort={sort}
				direction={direction}
				filtered={hasActiveFilters(filters)}
			/>
		</VStack>
	)
}

function subtitle(total: number | null): string {
	if (total === null) return "Every question you've posted"
	return `${total} ${pluralize(total, "question")}`
}

// Drops anything unset so an untouched filter sends no variable at all, keeping
// the opening state's query key identical to the one the loader prefetched.
function toQueryFilters(
	value: QuestionFilterValue,
	search: string,
): MyQuestionsFilters {
	return {
		...(value.leagueId ? { leagueId: value.leagueId } : {}),
		...(value.shapes.length > 0 ? { shapes: value.shapes } : {}),
		...(search ? { search } : {}),
		...(value.scope ? { scope: value.scope } : {}),
	}
}
