import { graphql } from "#/graphql/generated"

// Groups tab.
export const AdminGroupsDocument = graphql(`
	query AdminGroups($search: String) {
		adminGroups(search: $search) {
			__typename
			... on QueryAdminGroupsSuccess {
				data {
					id
					name
					memberCount
					createdAt
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
