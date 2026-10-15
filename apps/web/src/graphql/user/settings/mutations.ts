import { graphql } from "#/graphql/generated"

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

export const SetEmailPreferenceDocument = graphql(`
	mutation SetEmailPreference($input: SetEmailPreferenceInput!) {
		setEmailPreference(input: $input) {
			__typename
			... on User {
				id
				mutedEmailTypes
			}
			... on AuthenticationError {
				message
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

export const UnsubscribeFromEmailsDocument = graphql(`
	mutation UnsubscribeFromEmails($token: String!) {
		unsubscribeFromEmails(token: $token) {
			__typename
			... on MutationUnsubscribeFromEmailsSuccess {
				data
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
	mutation ResendEmailChange($redirectTo: String) {
		resendEmailChange(redirectTo: $redirectTo) {
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
