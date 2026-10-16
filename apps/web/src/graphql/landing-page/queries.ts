import { graphql } from "#/graphql/generated"

export const LandingPageDocument = graphql(`
	query LandingPage {
		leagues {
			id
			name
			abbreviation
			slug
		}
		# The solo section's try-it stack. guestPickQuestions returns the soonest games
		# in every active league rather than the soonest overall, so a visitor
		# who only follows one sport is offered it whether its next game is
		# tomorrow or a month out. guestPickLeagues builds the chip row out of
		# what comes back and guestPickGames turns each game into its stack:
		# who wins, then each team's total (see select-guest-picks.ts).
		#
		# 6 games per league: the stack shows one, and the rest are what Skip
		# draws on without leaving that league.
		guestPicks: guestPickQuestions(
			perLeague: 6
			shapes: [TEAM_VS_TEAM, TEAM_STAT_OVER_UNDER]
		) {
			id
			shape
			locksAt
			league {
				id
				abbreviation
			}
			game {
				id
				awayTeam {
					id
				}
			}
			subjectTeam {
				id
			}
			...GuestPickCard_question
		}
	}
`)
