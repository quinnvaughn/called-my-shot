import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// The leagues and teams the viewer follows: exactly the spaces on their
// space rail and under Your spaces on the Spaces page, and what Home's
// follow suggestions leave out. Loaded by
// _app for a signed-in viewer, so the rail has it on first render.
export const MyFollowsDocument = graphql(`
	query MyFollows {
		myFollows {
			leagues {
				id
			}
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
				}
			}
		}
	}
`)

export const myFollowsQuery = gqlQueryOptions(MyFollowsDocument, {})
