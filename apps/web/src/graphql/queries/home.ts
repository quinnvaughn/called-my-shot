import { graphql } from "#/graphql/generated"

// Home - a bounded, time-scoped checklist, not a growing catalogue (see
// home.tsx). Seven sections, one query: the viewer's career stats (the same
// numbers the profile leads with), their calls on games in flight (the same
// list My Calls pins above its Open tab), room cards (per-league counts),
// locking soon (site-wide, closing-soon open questions - reuses the same
// `questions(sort: CLOSING_SOON)` behavior the old cross-league feed used),
// just resolved (the viewer's own calls, most recently decided first), the
// viewer's live hot streaks, and their results calendar.
//
// The calendar comes in two spans because it renders in two places. The
// right rail is under half the main column's width, so it shows a quarter,
// which draws its squares close to the size the profile's half year does.
// Below the rail's breakpoint it sits in the main column at the profile's
// own span. Both read the same per-request record inputs on the server.
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
			careerStats {
				rank
				totalPoints
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
			record {
				calendar {
					...ResultsCalendar_calendar
				}
			}
			railRecord: record(weeks: 13) {
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
