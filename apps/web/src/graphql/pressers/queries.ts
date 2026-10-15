import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

export const AdminPresserReportsDocument = graphql(`
	query AdminPresserReports {
		adminPresserReports {
			id
			target
			reason
			details
			createdAt
			reportedText
			questionBody
			reporter {
				id
				username
			}
			author {
				id
				username
			}
			presser {
				id
				owner {
					id
					username
				}
				game {
					id
				}
			}
		}
	}
`)

export const adminPresserReportsQuery = gqlQueryOptions(
	AdminPresserReportsDocument,
	{},
)

export const BlockedUsersDocument = graphql(`
	query BlockedUsers {
		blockedUsers {
			id
			...Identity_user
		}
	}
`)
