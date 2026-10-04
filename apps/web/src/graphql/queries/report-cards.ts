import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

export const UserReportCardPageDocument = graphql(`
	query UserReportCardPage(
		$username: String!
		$league: String!
		$windowKey: String!
	) {
		userByUsername(username: $username) {
			id
			username
			name
			reportCard(league: $league, windowKey: $windowKey) {
				windowKey
				windowLabel
				settledCount
				wins
				losses
				pendingCount
				totalPoints
				committedPoints
				returnPct
				grade
				isFinal
				league {
					id
					slug
					abbreviation
				}
				...ReportCard_card
			}
		}
	}
`)

export const userReportCardPageQuery = (
	username: string,
	league: string,
	windowKey: string,
) =>
	gqlQueryOptions(UserReportCardPageDocument, { username, league, windowKey })
