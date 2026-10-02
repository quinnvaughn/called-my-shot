import { graphql } from "#/graphql/generated"

export const UserProfileDocument = graphql(`
	query UserProfile($username: String!) {
		userByUsername(username: $username) {
			id
			name
			username
			avatarUrl
			bannerUrl
			createdAt
			...Identity_user
			careerStats {
				rank
				totalPoints
				accuracy
				convictionEdge
				resolvedCallCount
			}
			leagues {
				league {
					id
					name
					abbreviation
					slug
				}
				totalPoints
				rank
				accuracy
				convictionEdge
				resolvedCallCount
			}
			streaks {
				league {
					id
					abbreviation
					slug
				}
				family
				familyLabel
				currentLength
				bestLength
				nextMilestone
			}
			coldStreaks {
				league {
					id
					abbreviation
					slug
				}
				family
				familyLabel
				currentColdLength
				worstColdLength
			}
			sweeps {
				league {
					id
					abbreviation
					slug
				}
				slateKey
				slateLabel
				gameCount
				firstStartsAt
			}
			recentCalls {
				id
				...CallCard_call
			}
		}
	}
`)

// The profile's results calendar and points breakdown, for the whole career
// or one league. Its own query rather than part of UserProfile so switching
// leagues refetches only this.
export const UserRecordDocument = graphql(`
	query UserRecord($username: String!, $league: String) {
		userByUsername(username: $username) {
			id
			record(league: $league) {
				wins
				losses
				returnPct
				netFromCalls
				bonusPoints
				calendar {
					startDay
					endDay
					activeDays
					callCount
					days {
						day
						settledCount
						wins
						losses
						pendingCount
						netPoints
						returnPct
						grade
						leagues {
							league {
								id
								abbreviation
								slug
							}
							windowKey
							settledCount
							wins
							losses
							pendingCount
							netPoints
						}
					}
				}
				byLeague {
					league {
						id
						name
						abbreviation
						slug
					}
					settledCount
					wins
					losses
					netPoints
					returnPct
				}
				byFamily {
					family
					label
					settledCount
					wins
					losses
					netPoints
					returnPct
				}
				byShape {
					shape
					family
					label
					settledCount
					wins
					losses
					netPoints
					returnPct
				}
				byTeam {
					team {
						id
						name
					}
					settledCount
					wins
					losses
					netPoints
					returnPct
				}
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
			avatarUrl
			bannerUrl
			email
			emailVerified
			hasPassword
			mutedEmailTypes
			pendingEmailChange {
				newEmail
				expiresAt
			}
			equippedFlair {
				id
				...Flair_flair
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
