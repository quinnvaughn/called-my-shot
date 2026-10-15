import { graphql } from "#/graphql/generated"

// Users tab.
export const AdminUsersDocument = graphql(`
	query AdminUsers(
		$search: String
		$sortBy: AdminUserSort
		$sortDir: SortDirection
	) {
		adminUsers(search: $search, sortBy: $sortBy, sortDir: $sortDir) {
			__typename
			... on QueryAdminUsersSuccess {
				data {
					id
					name
					username
					strikeCount
					questionCreationEnabled
					isVerifiedPundit
					careerStats {
						totalPoints
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

export const AdminUserVoidHistoryDocument = graphql(`
	query AdminUserVoidHistory($userId: ID!) {
		adminUserVoidHistory(userId: $userId) {
			__typename
			... on QueryAdminUserVoidHistorySuccess {
				data {
					id
					questionTitle
					reason
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
