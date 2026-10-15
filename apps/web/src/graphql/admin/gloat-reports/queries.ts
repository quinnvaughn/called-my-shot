import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

export const AdminGloatReportsDocument = graphql(`
	query AdminGloatReports {
		adminGloatReports {
			id
			reason
			details
			createdAt
			challengeCode
			reporter {
				id
				username
			}
			gloat {
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

export const adminGloatReportsQuery = gqlQueryOptions(
	AdminGloatReportsDocument,
	{},
)
