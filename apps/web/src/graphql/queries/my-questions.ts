import { graphql } from "#/graphql/generated"
import type {
	MyQuestionSort,
	QuestionScope,
	QuestionShape,
	QuestionStatus,
} from "#/graphql/generated/graphql"
import { gqlInfiniteQueryOptions } from "#/graphql/query-options"

export const MyQuestionsDocument = graphql(`
    query MyQuestions(
        $after: String
        $leagueId: ID
        $shapes: [QuestionShape!]
        $search: String
        $scope: QuestionScope
        $status: QuestionStatus
        $sort: MyQuestionSort
    ) {
        myQuestions(
            first: 10
            after: $after
            leagueId: $leagueId
            shapes: $shapes
            search: $search
            scope: $scope
            status: $status
            sort: $sort
        ) {
            items {
                id
                ...MyQuestionsTab_question
            }
            totalCount
            pageInfo {
                hasNextPage
                endCursor
            }
        }
    }
`)

export type MyQuestionsFilters = {
	leagueId?: string
	shapes?: QuestionShape[]
	search?: string
	scope?: QuestionScope
	status?: QuestionStatus
}

// Same "every filter is part of the query key" reasoning as myCallsQuery, and
// the no-argument call still produces the variables the route loader prefetches
// under.
export const myQuestionsQuery = (
	filters: MyQuestionsFilters = {},
	sort?: MyQuestionSort,
) =>
	gqlInfiniteQueryOptions(
		MyQuestionsDocument,
		{ ...filters, sort },
		(data) => data.myQuestions,
	)
