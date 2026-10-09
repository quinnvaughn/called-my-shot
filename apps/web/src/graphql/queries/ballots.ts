import { graphql } from "#/graphql/generated"

// The public ballot detail page - anyone can view it (signed out, a shared
// link, a scraper), same visibility rule the `ballot` query already enforces
// server-side (resolves to null for anything not published). No __typename
// union to match here since the field itself is plain-nullable, not
// errors-wrapped, matching `league`/`game`.
// `ref` is the slug the page is addressed by today, or the uuid it used to
// be - the resolver takes either, so a link shared before ballots had slugs
// still lands (the route redirects it to the canonical slug url).
export const BallotByRefDocument = graphql(`
	query BallotByRef($ref: ID!) {
		ballot(id: $ref) {
			id
			slug
			name
			league {
				id
				name
				abbreviation
				slug
				seasonFormat {
					gamesPerSeason
				}
			}
			memberCount
			viewerCalledCount
			viewerGuessSum
			nextLocksAt
			completions {
				...BallotCompletionsList_summary
			}
			viewerGroupBoards {
				memberCount
				finishedCount
				viewerIsAdmin
				onGroupPage
				group {
					id
					name
					logoUrl
				}
			}
			members {
				...BallotPositionRow_member
				# The projected standings view on a win-totals ballot.
				viewerTiebreakPosition
				question {
					id
					stat {
						id
						name
					}
					subjectTeam {
						id
						name
						abbreviation
						color
						logoUrl
						conference
						division
					}
					# Read by the page itself (progress stats, share text), not
					# just the row, so selected here rather than left masked.
					viewerCall {
						id
						hitTolerance
						totalPoints
						guessValue
						conviction
						rebalancedFrom
						selections {
							id
							option {
								id
								fieldPct
								isCorrect
							}
						}
						...PickPositionRow_call
					}
				}
			}
		}
	}
`)

// /ballots/<slug>/<username> - one user's picks on a ballot. Public like the
// ballot page; `entry` is null for an unknown username or someone who hasn't
// called anything on it.
export const BallotEntryDocument = graphql(`
	query BallotEntry($ref: ID!, $username: String!) {
		ballot(id: $ref) {
			id
			slug
			name
			memberCount
			league {
				id
				name
				abbreviation
				slug
				seasonFormat {
					gamesPerSeason
				}
			}
			entry(username: $username) {
				calledCount
				wins
				losses
				points
				user {
					id
					name
					username
					avatarUrl
				}
				members {
					member {
						id
						section
						slot
						label
						question {
							id
							status
							locksAt
							stat {
								id
								name
							}
							subjectTeam {
								id
								name
								abbreviation
								color
								logoUrl
								conference
								division
							}
						}
					}
					call {
						id
						guessValue
						conviction
						rebalancedFrom
						...CallCard_call
					}
					tiebreakPosition
				}
			}
		}
	}
`)

// Backs the create-question form's "add to ballot" autocomplete - a bounded
// typeahead result set scoped to the question's own league, same shape as
// GamesByLeagueDocument (queries/sports.ts).
export const AdminBallotSearchDocument = graphql(`
	query AdminBallotSearch($leagueId: ID!, $query: String, $first: Int) {
		adminBallotSearch(leagueId: $leagueId, query: $query, first: $first) {
			__typename
			... on QueryAdminBallotSearchSuccess {
				data {
					id
					name
					memberCount
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

// Admin Ballots list page - both its modes. Browsing every league pages
// through with `after`; scoped to one league and season it asks for the whole
// scope at once (`first`) and sorts on SORT_ORDER, since reordering a list
// you can only see one page of doesn't work.
export const AdminBallotsDocument = graphql(`
	query AdminBallots(
		$search: String
		$status: BallotStatus
		$leagueId: ID
		$seasonId: ID
		$sortBy: AdminBallotSort
		$sortDir: SortDirection
		$first: Int
		$after: String
	) {
		adminBallots(
			search: $search
			status: $status
			leagueId: $leagueId
			seasonId: $seasonId
			sortBy: $sortBy
			sortDir: $sortDir
			first: $first
			after: $after
		) {
			__typename
			... on QueryAdminBallotsSuccess {
				data {
					items {
						id
						name
						status
						memberCount
						sortOrder
						league {
							id
							name
							abbreviation
						}
					}
					pageInfo {
						hasNextPage
						endCursor
					}
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

// Ballot builder's "attach existing" modal - questions in the ballot's own
// league that don't already belong to a ballot (a question can only ever be
// in one). Reuses adminQuestions rather than a bespoke query.
export const BallotAttachableQuestionsDocument = graphql(`
	query BallotAttachableQuestions($leagueId: ID!, $search: String) {
		adminQuestions(
			leagueId: $leagueId
			unassignedToBallot: true
			search: $search
			first: 30
		) {
			__typename
			... on QueryAdminQuestionsSuccess {
				data {
					items {
						id
						title
						shape
						status
					}
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

// Ballot builder page - includes draft ballots and the full unfiltered member
// list (unlike the public `ballot` query, which only ever resolves once
// published). Also used to resolve a ballot's display name when the
// create-question form arrives locked to one via ?ballotId=.
export const AdminBallotDocument = graphql(`
	query AdminBallot($id: ID!) {
		adminBallot(id: $id) {
			__typename
			... on QueryAdminBallotSuccess {
				data {
					id
					name
					status
					publishedAt
					memberCount
					league {
						id
						name
						abbreviation
					}
					members {
						id
						label
						slot
						section
						sortOrder
						question {
							id
							title
							shape
							status
							locksAt
						}
					}
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)
