import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// Queue tab's landing view - locked-and-likely-over / locked-and-probably-
// still-live estimates (see adminQueueSummary's resolver for the "no live
// feed, so this is a guess" reasoning) plus open disputes and two headline
// counts.
export const AdminQueueSummaryDocument = graphql(`
	query AdminQueueSummary {
		adminQueueSummary {
			__typename
			... on QueryAdminQueueSummarySuccess {
				data {
					liveQuestionsCount
					usersLockedCount
					needsResolution {
						id
						title
						shape
						locksAt
						callCount
						game {
							id
							startsAt
							status
							awayScore
							homeScore
							league {
								id
								abbreviation
							}
							awayTeam {
								id
								abbreviation
							}
							homeTeam {
								id
								abbreviation
							}
						}
						creator {
							id
							username
						}
					}
					probablyStillLive {
						id
						title
						locksAt
						callCount
					}
					autoResolveEscalated {
						failureReason
						failureDetail
						question {
							id
							title
							locksAt
							callCount
							game {
								id
								startsAt
								status
								awayScore
								homeScore
								league {
									id
									abbreviation
								}
								awayTeam {
									id
									abbreviation
								}
								homeTeam {
									id
									abbreviation
								}
							}
						}
					}
					disputed {
						id
						reason
						createdAt
						question {
							id
							title
						}
						user {
							id
							username
						}
					}
					reported {
						id
						reason
						details
						createdAt
						question {
							id
							title
						}
						reportedBy {
							id
							username
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

export const adminQueueSummaryQuery = gqlQueryOptions(
	AdminQueueSummaryDocument,
	{},
)

// Questions tab - every question regardless of status, newest first, with an
// optional status filter and search. Reuses the same `questions` field the
// home feed uses (sort: NEW, no leagueId/teamId scoping) rather than a
// bespoke admin query - the only thing admin needed that field didn't already
// have was the status arg, added directly to it.
export const AdminQuestionsDocument = graphql(`
	query AdminQuestions(
		$search: String
		$status: QuestionStatus
		$sortBy: AdminQuestionSort
		$sortDir: SortDirection
		$after: String
	) {
		adminQuestions(
			search: $search
			status: $status
			sortBy: $sortBy
			sortDir: $sortDir
			first: 30
			after: $after
		) {
			__typename
			... on QueryAdminQuestionsSuccess {
				data {
					items {
						id
						title
						shape
						status
						isOfficial
						createdAt
						locksAt
						callCount
						creator {
							id
							username
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

// Disputes tab - every currently-open dispute, oldest first (same order
// adminQueueSummary's disputed list uses).
export const AdminDisputesDocument = graphql(`
	query AdminDisputes {
		adminQueueSummary {
			__typename
			... on QueryAdminQueueSummarySuccess {
				data {
					disputed {
						id
						reason
						createdAt
						question {
							id
							title
							shape
							ouLine
							numericActualValue
							numericToleranceAbsolute
							stat {
								id
								toleranceTier {
									id
									toleranceMode
									toleranceValue
								}
							}
							status
							resolutionNote
							resolutionSource
							resolutionSourceUrl
							options {
								id
								label
								isCorrect
								actualValue
							}
						}
						user {
							id
							username
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

export const adminDisputesQuery = gqlQueryOptions(AdminDisputesDocument, {})

// Reports tab - every currently-open report, oldest first (same order
// adminQueueSummary's reported list uses).
export const AdminReportsDocument = graphql(`
	query AdminReports {
		adminQueueSummary {
			__typename
			... on QueryAdminQueueSummarySuccess {
				data {
					reported {
						id
						reason
						details
						createdAt
						question {
							id
							title
							creator {
								id
								username
							}
						}
						reportedBy {
							id
							username
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

export const adminReportsQuery = gqlQueryOptions(AdminReportsDocument, {})
