import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// What a person's card shows when their name is tapped: their standing,
// whether they're hot, and how they've done against the viewer.
export const UserCardDocument = graphql(`
	query UserCard($username: String!) {
		userByUsername(username: $username) {
			id
			viewerFollows
			careerStats {
				totalPoints
				rank
				accuracy
				resolvedCallCount
			}
			streaks {
				currentLength
				familyLabel
				league {
					id
					abbreviation
				}
			}
			headToHeadWithViewer {
				wins
				losses
				draws
			}
		}
	}
`)

export const userCardQuery = (username: string) =>
	gqlQueryOptions(UserCardDocument, { username })
