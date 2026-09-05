import { graphql } from "#/graphql/generated"
import { gqlInfiniteQueryOptions } from "#/graphql/query-options"

export const MyQuestionsDocument = graphql(`
    query MyQuestions($after: String) {
        myQuestions(first: 10, after: $after) {
            items {
                id
                ...MyQuestionsTab_question
            }
            pageInfo {
                hasNextPage
                endCursor
            }
        }
    }
`)

export const myQuestionsQuery = () =>
	gqlInfiniteQueryOptions(MyQuestionsDocument, {}, (data) => data.myQuestions)
