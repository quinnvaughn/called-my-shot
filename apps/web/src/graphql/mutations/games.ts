import { graphql } from "#/graphql/generated"

export const SetGameReminderDocument = graphql(`
	mutation SetGameReminder($gameId: ID!) {
		setGameReminder(gameId: $gameId) {
			__typename
			... on Game {
				id
				viewerHasReminder
			}
			... on AuthenticationError {
				message
			}
			... on NotFoundError {
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

export const RemoveGameReminderDocument = graphql(`
	mutation RemoveGameReminder($gameId: ID!) {
		removeGameReminder(gameId: $gameId) {
			__typename
			... on Game {
				id
				viewerHasReminder
			}
			... on AuthenticationError {
				message
			}
			... on NotFoundError {
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

// Read right after a reminder is set, to tell the viewer when it can only
// arrive in-app. Not part of Me: nothing else outside settings needs it.
export const MutedEmailTypesDocument = graphql(`
	query MutedEmailTypes {
		me {
			id
			mutedEmailTypes
		}
	}
`)
