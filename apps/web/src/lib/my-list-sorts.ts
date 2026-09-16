import type { CallSortOrder, MyQuestionSort } from "#/graphql/generated/graphql"

// The sort options and per-list defaults for My Calls and My Questions.
//
// Out here rather than inside the route files because each route's loader and
// its component both need the defaults, and they have to agree exactly: the
// loader seeds a cache entry under the default sort, and the component reads
// the entry named by whatever sort it starts with. A default that drifts
// between the two doesn't break anything visibly, it just quietly wastes the
// preload - see graphql/queries/my-lists-seed.test.ts.

type CallSortSet = {
	default: CallSortOrder
	options: { value: CallSortOrder; label: string }[]
}

// Closing Soon is meaningless once a question has settled and Points is
// meaningless before it has, so neither tab offers the other's.
export const MY_CALL_SORTS: Record<"open" | "resolved", CallSortSet> = {
	open: {
		default: "CLOSING_SOON",
		options: [
			{ value: "CLOSING_SOON", label: "Closing Soon" },
			{ value: "NEWEST", label: "Newest" },
			{ value: "CONVICTION", label: "Conviction" },
		],
	},
	resolved: {
		default: "POINTS",
		options: [
			{ value: "POINTS", label: "Points" },
			{ value: "NEWEST", label: "Newest" },
			{ value: "CONVICTION", label: "Conviction" },
		],
	},
}

export const DEFAULT_MY_QUESTIONS_SORT: MyQuestionSort = "NEWEST"

export const MY_QUESTION_SORTS: { value: MyQuestionSort; label: string }[] = [
	{ value: "NEWEST", label: "Newest" },
	{ value: "CLOSING_SOON", label: "Closing Soon" },
	{ value: "MOST_CALLED", label: "Most Called" },
]
