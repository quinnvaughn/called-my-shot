import { graphql } from "#/graphql/generated"

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

// Fired by the /home prompt as it opens. The server keeps the first time, so
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
