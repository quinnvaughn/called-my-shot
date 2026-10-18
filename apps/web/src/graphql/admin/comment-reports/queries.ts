import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

export const AdminCommentReportsDocument = graphql(`
	query AdminCommentReports {
		adminCommentReports {
			id
			reason
			details
			createdAt
			challengeCode
			chainId
			groupId
			reporter {
				id
				username
			}
			comment {
				id
				text
				gif {
					url
					alt
				}
				sender {
					id
					username
				}
			}
		}
	}
`)

export const adminCommentReportsQuery = gqlQueryOptions(
	AdminCommentReportsDocument,
	{},
)
