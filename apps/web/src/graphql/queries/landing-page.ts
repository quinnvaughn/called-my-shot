import { graphql } from "#/graphql/generated"

export const LandingPageDocument = graphql(`
	query LandingPage {
		leagues {
			id
			name
			abbreviation
			slug
		}
		# The hero's try-it stack. guestPickQuestions returns the soonest
		# questions in every active league rather than the soonest overall, so
		# a visitor who only follows one sport is offered it whether its next
		# game is tomorrow or a month out. Limited to shapes that take a single
		# tap to call. guestPickLeagues builds the chip row out of what comes
		# back and orderGuestPicks scopes the stack to the chosen league.
		#
		# 8 per league: the stack shows three, and the rest are what Skip draws
		# on without leaving that league.
		guestPicks: guestPickQuestions(
			perLeague: 8
			shapes: [
				TEAM_VS_TEAM
				YES_NO_PROP
				PLAYER_STAT_OVER_UNDER
				TEAM_STAT_OVER_UNDER
				GAME_TOTAL_OVER_UNDER
				PLAYER_VS_PLAYER
			]
		) {
			id
			shape
			locksAt
			league {
				id
				abbreviation
			}
			...GuestPickCard_question
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
