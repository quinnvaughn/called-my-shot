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
			favoriteTeams {
				id
				name
				abbreviation
				color
				logoUrl
			}
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
			openPressers {
				...ProfilePresser_presser
			}
			pressers {
				...ProfilePresser_presser
			}
		}
	}
`)

// The profile's results calendar and points breakdown, for the whole career
// or one league. Its own query rather than part of UserProfile so switching
// leagues refetches only this.
//
// The calendar comes in two spans: the server's default eight weeks below lg,
// so a phone fits the grid with squares big enough to tap, and half a year
// from lg, where the profile's main column has room for it.
export const UserRecordDocument = graphql(`
	query UserRecord($username: String!, $league: String) {
		userByUsername(username: $username) {
			id
			wideRecord: record(league: $league, weeks: 26) {
				calendar {
					...ResultsCalendar_calendar
				}
			}
			record(league: $league) {
				wins
				losses
				returnPct
				netFromCalls
				bonusPoints
				calendar {
					...ResultsCalendar_calendar
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
						...Team_team @unmask
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

// One earlier span of the results calendar, for paging back from the one the
// page loaded with. Selects only the calendar, so a step back doesn't drag the
// breakdown along. Page 0 is the span ending today, which arrives with the
// page itself (UserRecord, HomeDashboard) and is never fetched through this.
export const UserRecordCalendarDocument = graphql(`
	query UserRecordCalendar(
		$username: String!
		$league: String
		$weeks: Int!
		$page: Int!
	) {
		userByUsername(username: $username) {
			id
			record(league: $league, weeks: $weeks, page: $page) {
				calendar {
					...ResultsCalendar_calendar
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
			favoriteTeams {
				id
				name
				abbreviation
				color
				logoUrl
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
