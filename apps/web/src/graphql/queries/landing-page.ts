import { graphql } from "#/graphql/generated"

export const LandingPageDocument = graphql(`
	query LandingPage {
		leagues {
			id
			name
			abbreviation
			slug
		}
		questions(sort: CLOSING_SOON, first: 6, isOfficial: true) {
			items {
				id
				...QuestionCard_question
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
