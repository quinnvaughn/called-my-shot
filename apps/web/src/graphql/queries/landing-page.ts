import { graphql } from "#/graphql/generated"

export const LandingPageDocument = graphql(`
	query LandingPage {
		leagues {
			id
			name
			abbreviation
			slug
		}
		# The hero's try-it stack: official questions locking within the next
		# two days, limited to shapes that take a single tap to call.
		# orderGuestPicks decides which lead and which back the Skip button.
		guestPicks: questions(
			sort: CLOSING_SOON
			first: 12
			isOfficial: true
			shapes: [
				TEAM_VS_TEAM
				YES_NO_PROP
				PLAYER_STAT_OVER_UNDER
				TEAM_STAT_OVER_UNDER
				GAME_TOTAL_OVER_UNDER
				PLAYER_VS_PLAYER
			]
		) {
			items {
				id
				shape
				locksAt
				league {
					id
				}
				...GuestPickCard_question
			}
		}
		# Current season, matching /leaderboard's own default - "the
		# leaderboard" should mean the same thing on the front page as it does
		# on the page itself.
		leaderboard(first: 5, season: { scope: CURRENT }) {
			items {
				...Leaderboard_entry
			}
		}
	}
`)
