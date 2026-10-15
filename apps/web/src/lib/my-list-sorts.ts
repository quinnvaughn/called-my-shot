import type { SortOption } from "#/components/questions/sort-switcher"
import type {
	CallSortOrder,
	MyQuestionSort,
	SortDirection,
} from "#/graphql/generated/graphql"

// The sort options and per-list defaults for My Calls and My Questions.
//
// Out here rather than inside the route files because each route's loader and
// its component both need the defaults, and they have to agree exactly: the
// loader seeds a cache entry under the default sort, and the component reads
// the entry named by whatever sort it starts with. A default that drifts
// between the two doesn't break anything visibly, it just quietly wastes the
// preload - see graphql/my-calls/my-lists-seed.test.ts.

type CallSortSet = {
	default: CallSortOrder
	options: SortOption<CallSortOrder>[]
}

// Every list opens descending (newest, most points, most conviction first);
// the direction is flipped from the active sort pill.
export const DEFAULT_MY_LIST_DIRECTION: SortDirection = "DESC"

const DATE: SortOption<"DATE"> = {
	value: "DATE",
	label: "Date",
	directions: { desc: "Newest first", asc: "Oldest first" },
}

const CONVICTION: SortOption<"CONVICTION"> = {
	value: "CONVICTION",
	label: "Conviction",
	directions: { desc: "Most conviction first", asc: "Least conviction first" },
}

const POINTS: SortOption<"POINTS"> = {
	value: "POINTS",
	label: "Points",
	directions: { desc: "Most points first", asc: "Fewest points first" },
}

// Points is meaningless before a question has settled, so the Open tab
// doesn't offer it. Neither tab offers a "live" ordering: a call whose game
// is in flight is lifted out of the list entirely, into the Playing Now
// row above it (see LiveCallsSection).
export const MY_CALL_SORTS: Record<"open" | "resolved", CallSortSet> = {
	open: {
		default: "DATE",
		options: [DATE, CONVICTION],
	},
	resolved: {
		default: "POINTS",
		options: [POINTS, DATE, CONVICTION],
	},
}

export const DEFAULT_MY_QUESTIONS_SORT: MyQuestionSort = "DATE"

// Closing Soon and Most Called already name their direction, so only Date
// flips.
export const MY_QUESTION_SORTS: SortOption<MyQuestionSort>[] = [
	DATE,
	{ value: "CLOSING_SOON", label: "Closing Soon" },
	{ value: "MOST_CALLED", label: "Most Called" },
]
