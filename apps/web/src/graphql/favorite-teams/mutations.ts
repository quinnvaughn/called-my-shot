import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	MyFlairsDocument,
	SettingsPageDocument,
	UserProfileDocument,
	ViewerOnboardingDocument,
} from "#/graphql/generated/graphql"
import { invalidateOperations } from "#/graphql/query-options"

// Replaces the viewer's whole list, in the order given.
export const SetFavoriteTeamsDocument = graphql(`
	mutation SetFavoriteTeams($teamIds: [ID!]!) {
		setFavoriteTeams(teamIds: $teamIds) {
			__typename
			... on User {
				id
				favoriteTeams {
					id
				}
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
		}
	}
`)

// Fired by the Home prompt as it opens. The server keeps the first time, so
// sending it again is harmless.
export const MarkTeamsPromptSeenDocument = graphql(`
	mutation MarkTeamsPromptSeen {
		markTeamsPromptSeen {
			__typename
			... on User {
				id
				teamsPromptSeenAt
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)

// Settings and the profile list the teams, team flairs follow them, and the
// get-started checklist has a step for picking them.
export function invalidateFavoriteTeams(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		MyFlairsDocument,
		SettingsPageDocument,
		UserProfileDocument,
		ViewerOnboardingDocument,
	])
}
