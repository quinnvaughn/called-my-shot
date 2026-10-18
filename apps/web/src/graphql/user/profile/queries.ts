import { graphql } from "#/graphql/generated"

export const UserProfileDocument = graphql(`
	query UserProfile($username: String!) {
		userByUsername(username: $username) {
			id
			name
			username
			avatarUrl
			bannerUrl
			createdAt
			headToHeadWithViewer {
				wins
				losses
				draws
			}
			...Identity_user
			favoriteTeams {
				id
				name
				abbreviation
				color
				logoUrl
			}
			careerStats {
				rank
				totalPoints
				accuracy
				convictionEdge
				resolvedCallCount
			}
			leagues {
				league {
					id
					name
					abbreviation
					slug
				}
				totalPoints
				rank
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
			coldStreaks {
				league {
					id
					abbreviation
					slug
				}
				family
				familyLabel
				currentColdLength
				worstColdLength
			}
			sweeps {
				league {
					id
					abbreviation
					slug
				}
				slateKey
				slateLabel
				gameCount
				firstStartsAt
			}
			recentCalls {
				id
				...CallCard_call
			}
			openPressers {
				...ProfilePresser_presser
			}
			pressers {
				...ProfilePresser_presser
			}
		}
	}
`)

// The profile's results calendar and points breakdown, for the whole career
// or one league. Its own query rather than part of UserProfile so switching
// leagues refetches only this.
//
// The calendar comes in two spans: the server's default eight weeks below lg,
// so a phone fits the grid with squares big enough to tap, and half a year
// from lg, where the profile's main column has room for it.
export const UserRecordDocument = graphql(`
	query UserRecord($username: String!, $league: String) {
		userByUsername(username: $username) {
			id
			wideRecord: record(league: $league, weeks: 26) {
				calendar {
					...ResultsCalendar_calendar
				}
			}
			record(league: $league) {
				wins
				losses
				returnPct
				netFromCalls
				bonusPoints
				chainBonusPoints
				calendar {
					...ResultsCalendar_calendar
				}
				byLeague {
					league {
						id
						name
						abbreviation
						slug
					}
					settledCount
					wins
					losses
					netPoints
					returnPct
				}
				byFamily {
					family
					label
					settledCount
					wins
					losses
					netPoints
					returnPct
				}
				byShape {
					shape
					family
					label
					settledCount
					wins
					losses
					netPoints
					returnPct
				}
				byTeam {
					team {
						...Team_team @unmask
					}
					settledCount
					wins
					losses
					netPoints
					returnPct
				}
			}
		}
	}
`)

// One earlier span of the results calendar, for paging back from the one the
// page loaded with. Selects only the calendar, so a step back doesn't drag the
// breakdown along. Page 0 is the span ending today, which arrives with the
// page itself (UserRecord, HomeDashboard) and is never fetched through this.
export const UserRecordCalendarDocument = graphql(`
	query UserRecordCalendar(
		$username: String!
		$league: String
		$weeks: Int!
		$page: Int!
	) {
		userByUsername(username: $username) {
			id
			record(league: $league, weeks: $weeks, page: $page) {
				calendar {
					...ResultsCalendar_calendar
				}
			}
		}
	}
`)
