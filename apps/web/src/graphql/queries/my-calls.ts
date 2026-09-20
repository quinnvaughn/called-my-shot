import { graphql } from "#/graphql/generated"
import type {
	CallResolutionStatus,
	CallResultFilter,
	CallSortOrder,
	QuestionScope,
	QuestionShape,
} from "#/graphql/generated/graphql"
import {
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"

// open/resolved are fetched as aliased fields off the same myCalls connection
// (see graphql/types/question/queries.ts) so both tabs preload in one round trip -
// same pattern as GroupDetailDocument's per-tab connections.
//
// Unfiltered deliberately: this is the loader's first-paint query, and the page
// always opens on the default filter state. Once a filter or sort moves off its
// default, MyCallsDocument below takes over per tab.
export const MyCallsPageDocument = graphql(`
    query MyCallsPage($openAfter: String, $resolvedAfter: String) {
        myCallCounts {
            open
            resolved
        }
        open: myCalls(status: OPEN, first: 10, after: $openAfter) {
            items {
                id
                ...MyCallsTab_call
            }
            pageInfo {
                hasNextPage
                endCursor
            }
        }
        resolved: myCalls(status: RESOLVED, first: 10, after: $resolvedAfter) {
            items {
                id
                ...MyCallsTab_call
            }
            pageInfo {
                hasNextPage
                endCursor
            }
        }
        myLiveCalls {
            id
            ...MyCallsTab_call
        }
    }
`)

export const MyCallsDocument = graphql(`
    query MyCalls(
        $status: CallResolutionStatus!
        $after: String
        $leagueId: ID
        $shapes: [QuestionShape!]
        $search: String
        $scope: QuestionScope
        $result: CallResultFilter
        $sort: CallSortOrder
    ) {
        myCalls(
            status: $status
            first: 10
            after: $after
            leagueId: $leagueId
            shapes: $shapes
            search: $search
            scope: $scope
            result: $result
            sort: $sort
        ) {
            items {
                id
                ...MyCallsTab_call
            }
            pageInfo {
                hasNextPage
                endCursor
            }
        }
    }
`)

// The Playing Now section above the Open tab's list. Takes the same filters
// as the list (minus the ones only a settled call has) so narrowing to one
// league narrows both halves of the tab, not just the half below the fold.
// Unpaginated - the server caps it, since you can only have as many live
// calls as there are games in flight.
export const MyLiveCallsDocument = graphql(`
    query MyLiveCalls(
        $leagueId: ID
        $shapes: [QuestionShape!]
        $search: String
        $scope: QuestionScope
    ) {
        myLiveCalls(
            leagueId: $leagueId
            shapes: $shapes
            search: $search
            scope: $scope
        ) {
            id
            ...MyCallsTab_call
        }
    }
`)

// The tab badges. Takes the same filters as the list so "Open (12)" describes
// what the current filter matches rather than the lifetime total.
export const MyCallCountsDocument = graphql(`
    query MyCallCounts(
        $leagueId: ID
        $shapes: [QuestionShape!]
        $search: String
        $scope: QuestionScope
        $result: CallResultFilter
    ) {
        myCallCounts(
            leagueId: $leagueId
            shapes: $shapes
            search: $search
            scope: $scope
            result: $result
        ) {
            open
            resolved
        }
    }
`)

// What both queries above narrow by. Shapes/search are omitted rather than sent
// empty so an untouched filter hashes into the same query key the loader seeds
// under - see myCallsQuery below.
export type MyCallsFilters = {
	leagueId?: string
	shapes?: QuestionShape[]
	search?: string
	scope?: QuestionScope
	result?: CallResultFilter
}

export const myCallsPageQuery = gqlQueryOptions(MyCallsPageDocument, {})

export const myCallCountsQuery = (filters: MyCallsFilters = {}) =>
	gqlQueryOptions(MyCallCountsDocument, filters)

// `result` is dropped rather than passed through: it's a Resolved-tab filter
// and every live call is by definition unsettled, so sending it could only
// ever empty this section out.
export const myLiveCallsQuery = ({
	result: _result,
	...filters
}: MyCallsFilters = {}) => gqlQueryOptions(MyLiveCallsDocument, filters)

// Every filter and the sort are part of the variables, and therefore of the
// query key, so changing one starts a fresh list rather than appending to the
// previous one - same reasoning as leagueCommunityQuery.
//
// Called with no filters and no sort, this produces exactly the variables
// MyCallsPageDocument's aliased fields were fetched under, which is what lets
// the route loader seed this cache entry (see seedInfiniteQuery in my-calls.tsx).
// react-query hashes undefined-valued keys the same as absent ones, so the
// optional fields below don't break that match.
export const myCallsQuery = (
	status: CallResolutionStatus,
	filters: MyCallsFilters = {},
	sort?: CallSortOrder,
) =>
	gqlInfiniteQueryOptions(
		MyCallsDocument,
		{ status, ...filters, sort },
		(data) => data.myCalls,
		// The two tabs swap one list component for the other, so switching tabs
		// unmounts whichever list is on screen - and with it the only observer
		// of an in-flight fetch. That cancel isn't a superseded request, it's
		// just the tab going away, and all it produces is an `aborted` overlay
		// in dev. Same reasoning as the modal queries that pass this.
		{ abortable: false },
	)
