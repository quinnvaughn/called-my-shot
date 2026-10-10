import { graphql } from "#/graphql/generated"

// Every team the favorite-teams picker can offer, in one request. The picker
// filters by league tab and search locally, the same way the flair picker
// does, since the whole point is scanning for your team.
export const FavoriteTeamOptionsDocument = graphql(`
	query FavoriteTeamOptions {
		teams {
			id
			name
			abbreviation
			color
			logoUrl
			league {
				id
				slug
				abbreviation
				status
			}
		}
	}
`)
