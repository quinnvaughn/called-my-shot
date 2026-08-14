import { graphql } from "#/graphql/generated"

export const UserProfileDocument = graphql(`
	query UserProfile($username: String!) {
		userByUsername(username: $username) {
			id
			name
			username
			createdAt
			careerStats {
				rank
				totalPoints
				accuracy
				callCount
			}
			leagues {
				league {
					id
					name
					abbreviation
				}
				totalPoints
				rank
				accuracy
				callCount
				categoryBreakdown {
					category
					accuracy
					callCount
				}
			}
			recentCalls {
				id
				...CallCard_call
			}
		}
	}
`)

export const UpdateMyNameDocument = graphql(`
	mutation UpdateMyName($input: UpdateMyNameInput!) {
		updateMyName(input: $input) {
			__typename
			... on User {
				id
				name
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)
