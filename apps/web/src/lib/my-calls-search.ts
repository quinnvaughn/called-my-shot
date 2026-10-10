import type { QuestionFilterValue } from "#/components/filters/question-filter-bar"
import type {
	CallResultFilter,
	CallSortOrder,
	QuestionScope,
	QuestionShape,
	SortDirection,
} from "#/graphql/generated/graphql"
import { DEFAULT_MY_LIST_DIRECTION, MY_CALL_SORTS } from "#/lib/my-list-sorts"
import { questionShapeLabel } from "#/lib/question-labels"
import { shapeFitsScope } from "#/lib/scoring"

export type MyCallsTab = "open" | "resolved"

// The page's top-level split. Game calls and season-long calls get read for
// different things (what played out last night vs where a season race
// stands), so they're two lists rather than one with a scope filter. A ballot
// call lands on whichever side its question does: an awards ballot under
// Season, a week-of-games ballot under Games.
export type MyCallsKind = "game" | "season"

// URL shape for My Calls: ?kind=season&tab=resolved&league=nba
// &shapes=OVER_UNDER,PROP&result=HIT&q=lebron&sort=DATE&dir=asc. Every param
// is omitted at its default, so the plain /my-calls URL is the unfiltered
// Open tab of game calls.
// The league travels as its slug (readable, and the leagues in router context
// translate it to an id), shapes as one comma-separated param rather than a
// JSON-encoded array.
export type MyCallsSearch = {
	kind?: "season"
	tab?: "resolved"
	q?: string
	league?: string
	shapes?: string
	result?: CallResultFilter
	sort?: CallSortOrder
	dir?: "asc"
}

type SlugLeague = { id: string; slug: string }

const RESULTS: CallResultFilter[] = ["HIT", "MISS", "UNSCORED"]

// Anything unrecognized is dropped rather than erroring, so a hand-edited or
// stale link lands on the default view instead of a broken one. So is a shape
// the current side can't hold: switching Games to Season with a single-game
// shape picked would otherwise leave a filter the shape picker no longer
// shows, matching nothing.
export function validateMyCallsSearch(
	search: Record<string, unknown>,
): MyCallsSearch {
	const kind = search.kind === "season" ? "season" : undefined
	const tab = search.tab === "resolved" ? "resolved" : undefined
	const sortOptions = MY_CALL_SORTS[tab ?? "open"].options
	const scope = myCallsScope(kind ?? "game")
	return {
		kind,
		tab,
		q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
		league: typeof search.league === "string" ? search.league : undefined,
		shapes:
			typeof search.shapes === "string"
				? parseShapes(search.shapes)
						.filter((shape) => shapeFitsScope(shape, scope))
						.join(",") || undefined
				: undefined,
		result: RESULTS.find((r) => r === search.result),
		sort: sortOptions.find((o) => o.value === search.sort)?.value,
		dir: search.dir === "asc" ? "asc" : undefined,
	}
}

function parseShapes(value: string): QuestionShape[] {
	return value
		.split(",")
		.filter((s): s is QuestionShape => Object.hasOwn(questionShapeLabel, s))
}

export function myCallsKind(search: MyCallsSearch): MyCallsKind {
	return search.kind ?? "game"
}

export function myCallsScope(kind: MyCallsKind): QuestionScope {
	return kind === "season" ? "SEASON_LONG" : "GAME"
}

export function myCallsTab(search: MyCallsSearch): MyCallsTab {
	return search.tab ?? "open"
}

export function myCallsSort(search: MyCallsSearch): CallSortOrder {
	return search.sort ?? MY_CALL_SORTS[myCallsTab(search)].default
}

export function myCallsDirection(search: MyCallsSearch): SortDirection {
	return search.dir === "asc" ? "ASC" : DEFAULT_MY_LIST_DIRECTION
}

export function filtersFromSearch(
	search: MyCallsSearch,
	leagues: SlugLeague[],
): QuestionFilterValue {
	return {
		search: search.q ?? "",
		leagueId: leagues.find((l) => l.slug === search.league)?.id ?? null,
		shapes: search.shapes ? parseShapes(search.shapes) : [],
		// The Games/Season tabs carry scope on this page, not the filter bar.
		scope: null,
		result: search.result ?? null,
	}
}

// The inverse of filtersFromSearch, for the params the filter bar owns. The
// search text goes up untrimmed so the input it drives doesn't eat a trailing
// space mid-word; it's trimmed where it becomes a query variable.
export function filtersToSearch(
	value: QuestionFilterValue,
	leagues: SlugLeague[],
): Pick<MyCallsSearch, "q" | "league" | "shapes" | "result"> {
	return {
		q: value.search === "" ? undefined : value.search,
		league: leagues.find((l) => l.id === value.leagueId)?.slug,
		shapes: value.shapes.length > 0 ? value.shapes.join(",") : undefined,
		result: value.result ?? undefined,
	}
}
