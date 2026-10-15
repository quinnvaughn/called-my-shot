import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// The admin Integrity tab - see lib/self-grading-report.ts in the API.
export const AdminSelfGradingReportDocument = graphql(`
	query AdminSelfGradingReport {
		adminSelfGradingReport {
			__typename
			... on QueryAdminSelfGradingReportSuccess {
				data {
					userId
					username
					handGradedCount
					ownCallCount
					ownCallWins
					ownCallLosses
					ownCallPoints
					totalPoints
					overturnedCount
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

export const adminSelfGradingReportQuery = gqlQueryOptions(
	AdminSelfGradingReportDocument,
	{},
)

export const AdminFrequentCoCallersDocument = graphql(`
	query AdminFrequentCoCallers($creatorId: ID!) {
		adminFrequentCoCallers(creatorId: $creatorId) {
			__typename
			... on QueryAdminFrequentCoCallersSuccess {
				data {
					userId
					username
					emailVerified
					joinedAt
					sharedCount
					wins
					losses
					points
					shareOfTheirCalls
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)
