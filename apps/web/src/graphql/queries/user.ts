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

export const SettingsPageDocument = graphql(`
	query SettingsPage {
		me {
			id
			name
			username
			email
			emailVerified
			pendingEmailChange {
				newEmail
				expiresAt
			}
		}
	}
`)

export const UsernameAvailableDocument = graphql(`
	query UsernameAvailable($username: String!) {
		usernameAvailable(username: $username)
	}
`)

export const UpdateUsernameDocument = graphql(`
	mutation UpdateUsername($input: UpdateUsernameInput!) {
		updateUsername(input: $input) {
			__typename
			... on User {
				id
				username
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

export const RequestEmailChangeDocument = graphql(`
	mutation RequestEmailChange($input: RequestEmailChangeInput!) {
		requestEmailChange(input: $input) {
			__typename
			... on User {
				id
				email
				pendingEmailChange {
					newEmail
					expiresAt
				}
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

export const ResendEmailChangeDocument = graphql(`
	mutation ResendEmailChange {
		resendEmailChange {
			__typename
			... on User {
				id
				pendingEmailChange {
					newEmail
					expiresAt
				}
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

export const CancelEmailChangeDocument = graphql(`
	mutation CancelEmailChange {
		cancelEmailChange {
			__typename
			... on User {
				id
				pendingEmailChange {
					newEmail
					expiresAt
				}
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

export const ConfirmEmailChangeDocument = graphql(`
	mutation ConfirmEmailChange($token: String!) {
		confirmEmailChange(token: $token) {
			__typename
			... on User {
				id
				email
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const UpdatePasswordDocument = graphql(`
	mutation UpdatePassword($input: UpdatePasswordInput!) {
		updatePassword(input: $input) {
			__typename
			... on User {
				id
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

export const DeleteAccountDocument = graphql(`
	mutation DeleteAccount($input: DeleteAccountInput!) {
		deleteAccount(input: $input) {
			__typename
			... on MutationDeleteAccountSuccess {
				data
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
