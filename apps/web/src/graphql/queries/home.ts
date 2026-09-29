import { graphql } from "#/graphql/generated"

// Home - a bounded, time-scoped checklist, not a growing catalogue (see
// home.tsx). Three sections, one query: room cards (per-league counts),
// locking soon (site-wide, closing-soon open questions - reuses the same
// `questions(sort: CLOSING_SOON)` behavior the old cross-league feed used),
// and just resolved (the viewer's own calls, most recently decided first).
export const HomeDashboardDocument = graphql(`
	query HomeDashboard {
		leagues {
			id
			name
			abbreviation
			slug
			windowType
			currentWindowGameCount
			liveGameCount
			nextLockAt
			myOpenCallCount
			postseason {
				roundLabels
				currentWindowEliminationGameCount
			}
		}
		questions(sort: CLOSING_SOON, first: 6) {
			items {
				id
				...QuestionCard_question
			}
		}
		myRecentResolvedCalls(first: 3) {
			id
			question {
				id
				...QuestionCard_question
			}
		}
	}
`)
