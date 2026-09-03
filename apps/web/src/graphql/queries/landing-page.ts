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
		leaderboard(first: 5) {
			items {
				...Leaderboard_entry
			}
		}
	}
`)
