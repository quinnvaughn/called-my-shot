import { graphql } from "#/graphql/generated"
import type { SeasonFilterInput } from "#/graphql/generated/graphql"
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

// Standalone from LeaderboardPageDocument - the filters and the "show more"
// button both need to refetch this (and the viewer's own row, which moves
// with the scope too) on their own without touching the page's leagues list.
export const LeaderboardDocument = graphql(`
	query Leaderboard($leagueId: ID, $season: SeasonFilterInput, $after: String) {
		leaderboard(
			first: 10
			leagueId: $leagueId
			season: $season
			after: $after
		) {
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
		viewerLeaderboardEntry(leagueId: $leagueId, season: $season) {
			...Leaderboard_entry
		}
	}
`)

// Takes the same scope as LeaderboardDocument so its embedded first page is
// the one the route actually renders (the loader seeds the infinite cache
// with it) - a link to a filtered board shouldn't have to fetch the default
// board first.
export const LeaderboardPageDocument = graphql(`
	query LeaderboardPage($leagueId: ID, $season: SeasonFilterInput) {
		leaderboard(first: 10, leagueId: $leagueId, season: $season) {
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
		viewerLeaderboardEntry(leagueId: $leagueId, season: $season) {
			...Leaderboard_entry
		}
	}
`)

export const leaderboardPageQuery = (
	leagueId: string | null,
	season: SeasonFilterInput,
) => gqlQueryOptions(LeaderboardPageDocument, { leagueId, season })

export const leaderboardQuery = (
	leagueId: string | null,
	season: SeasonFilterInput,
) =>
	gqlInfiniteQueryOptions(
		LeaderboardDocument,
		{ leagueId, season },
		(data) => data.leaderboard,
	)
