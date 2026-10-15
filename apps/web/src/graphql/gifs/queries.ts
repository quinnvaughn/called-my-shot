import { graphql } from "#/graphql/generated"

// The admin Gifs tab - see lib/gif-health.ts in the API. Every url is checked
// live when this runs, so it is slower than the other admin queries by design.
export const AdminGifHealthDocument = graphql(`
	query AdminGifHealth {
		adminGifHealth {
			__typename
			... on QueryAdminGifHealthSuccess {
				data {
					emptyStates
					rows {
						state
						url
						alt
						status
						ok
						error
					}
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
