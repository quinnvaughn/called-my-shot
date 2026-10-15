import { graphql } from "#/graphql/generated"

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
			mutedPushTypes
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

export const UsernameAvailableDocument = graphql(`
	query UsernameAvailable($username: String!) {
		usernameAvailable(username: $username)
	}
`)
