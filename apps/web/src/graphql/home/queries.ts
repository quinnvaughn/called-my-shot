import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// Home's calls strip and right rail, one query: the viewer's calls on games
// in flight (the same list My Calls pins above its Open tab), locking soon
// (site-wide, closing-soon open questions), room cards (per-league counts,
// which lead the viewer's own profile Calls tab), just resolved (the
// viewer's own calls, most recently decided first), the viewer's live hot
// streaks, and their results calendar (the server's default span: no column
// it sits in is wide enough to want more).
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
		me {
			id
			username
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
			record {
				calendar {
					...ResultsCalendar_calendar
				}
			}
		}
		myLiveCalls {
			id
			...MyCallsTab_call
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

export const homeDashboardQuery = gqlQueryOptions(HomeDashboardDocument, {})
