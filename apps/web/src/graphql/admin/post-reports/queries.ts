import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

export const AdminPostReportsDocument = graphql(`
	query AdminPostReports {
		adminPostReports {
			id
			reason
			details
			createdAt
			reporter {
				id
				username
			}
			post {
				__typename
				id
				body
				removed
				author {
					id
					username
				}
				group {
					id
					name
				}
				... on RushmorePost {
					prompt {
						id
						code
						title
						isFranchise
						answerCount
					}
					picks {
						position
						player {
							id
							name
						}
					}
				}
			}
		}
	}
`)

export const adminPostReportsQuery = gqlQueryOptions(
	AdminPostReportsDocument,
	{},
)
