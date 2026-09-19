import { graphql } from "#/graphql/generated"

// Everything the viewer can equip right now. One request, filtered in the
// picker rather than paged - the whole point is scanning for your team.
export const MyFlairsDocument = graphql(`
	query MyFlairs {
		myFlairs {
			# Selected alongside the fragment because masking hides the
			# fragment's own id, and the picker keys and compares on it.
			id
			...Flair_flair
			source
			description
			team {
				id
				name
				league {
					id
					abbreviation
					slug
				}
			}
		}
	}
`)
