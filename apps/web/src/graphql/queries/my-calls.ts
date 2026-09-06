import { graphql } from "#/graphql/generated"
import type { CallResolutionStatus } from "#/graphql/generated/graphql"
import {
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"

// open/resolved are fetched as aliased fields off the same myCalls connection
// (see graphql/types/question/queries.ts) so both tabs preload in one round trip -
// same pattern as GroupDetailDocument's per-tab connections.
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
    }
`)

export const MyCallsDocument = graphql(`
    query MyCalls($status: CallResolutionStatus!, $after: String) {
        myCalls(status: $status, first: 10, after: $after) {
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

export const myCallsPageQuery = gqlQueryOptions(MyCallsPageDocument, {})

export const myCallsQuery = (status: CallResolutionStatus) =>
	gqlInfiniteQueryOptions(MyCallsDocument, { status }, (data) => data.myCalls)
