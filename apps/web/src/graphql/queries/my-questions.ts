import { graphql } from "#/graphql/generated"

export const MyQuestionsPageDocument = graphql(`
    query MyQuestionsPage($after: String) {
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
