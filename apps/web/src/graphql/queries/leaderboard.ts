import { graphql } from "#/graphql/generated"
import {
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"

export const LeaderboardEntryFragment = graphql(`
	fragment Leaderboard_entry on LeaderboardEntry {
		rank
		totalPoints
		accuracy
		callCount
		resolvedCallCount
		user {
			id
			name
			username
		}
	}
`)

// Standalone from LeaderboardPageDocument - the league tabs and "show more"
// button both need to refetch this (and the viewer's own row, which moves
// with the league too) on their own without touching the page's leagues list.
export const LeaderboardDocument = graphql(`
	query Leaderboard($leagueId: ID, $after: String) {
		leaderboard(first: 10, leagueId: $leagueId, after: $after) {
			items {
				rank
				user {
					id
				}
				...Leaderboard_entry
			}
			pageInfo {
				hasNextPage
				endCursor
			}
		}
		viewerLeaderboardEntry(leagueId: $leagueId) {
			...Leaderboard_entry
		}
	}
`)

export const LeaderboardPageDocument = graphql(`
	query LeaderboardPage {
		leagues {
			id
			name
			abbreviation
			slug
		}
		leaderboard(first: 10) {
			items {
				rank
				user {
					id
				}
				...Leaderboard_entry
			}
			pageInfo {
				hasNextPage
				endCursor
			}
		}
		viewerLeaderboardEntry {
			...Leaderboard_entry
		}
	}
`)

export const leaderboardPageQuery = gqlQueryOptions(LeaderboardPageDocument, {})

export const leaderboardQuery = (leagueId: string | null) =>
	gqlInfiniteQueryOptions(
		LeaderboardDocument,
		{ leagueId },
		(data) => data.leaderboard,
	)
