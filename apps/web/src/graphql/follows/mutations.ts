import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	LeagueByIdDocument,
	LeagueTeamSpaceDocument,
	LeagueTeamsDocument,
	MyFollowsDocument,
	UserCardDocument,
	UserProfileDocument,
} from "#/graphql/generated/graphql"
import { HomeFeedDocument } from "#/graphql/posts/queries"
import { invalidateOperations } from "#/graphql/query-options"

export const FollowDocument = graphql(`
	mutation Follow($kind: FollowTargetKind!, $id: ID!) {
		follow(kind: $kind, id: $id) {
			__typename
			... on FollowPayload {
				following
				targetId
			}
			... on ValidationError {
				message
			}
			... on NotFoundError {
				message
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

export const UnfollowDocument = graphql(`
	mutation Unfollow($kind: FollowTargetKind!, $id: ID!) {
		unfollow(kind: $kind, id: $id) {
			__typename
			... on FollowPayload {
				following
				targetId
			}
			... on ValidationError {
				message
			}
			... on NotFoundError {
				message
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

// Every read that shows whether the viewer follows something, or what
// following changes: the rail and Spaces, the league and team headers and
// grid, a profile's button and counts, a user card, and Home's feed.
const FOLLOW_DOCUMENTS = [
	HomeFeedDocument,
	MyFollowsDocument,
	LeagueByIdDocument,
	LeagueTeamsDocument,
	LeagueTeamSpaceDocument,
	UserProfileDocument,
	UserCardDocument,
]

export function invalidateFollows(queryClient: QueryClient) {
	return invalidateOperations(queryClient, FOLLOW_DOCUMENTS)
}
