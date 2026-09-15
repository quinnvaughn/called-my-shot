import { graphql } from "#/graphql/generated"

// Data page's own entry point - the paginated/sortable league list. Sports
// selected separately (SportsForAdminDocument below) since the add-league
// modal needs it regardless of which page of leagues is loaded.
export const AdminLeaguesDocument = graphql(`
	query AdminLeagues($sortBy: AdminLeagueSort, $sortDir: SortDirection, $after: String) {
		adminLeagues(sortBy: $sortBy, sortDir: $sortDir, after: $after, first: 100) {
			__typename
			... on QueryAdminLeaguesSuccess {
				data {
					items {
						id
						name
						abbreviation
						slug
						status
						sport {
							id
							name
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

export const SportsForAdminDocument = graphql(`
	query SportsForAdmin {
		sports {
			id
			name
		}
	}
`)

// League detail layout's own header - just the name. Kept separate from the
// team-options list below so a page that doesn't need the picker (Teams,
// Games' own layout) doesn't fetch it.
export const AdminLeagueDocument = graphql(`
	query AdminLeague($leagueId: ID!) {
		league(id: $leagueId) {
			id
			name
		}
	}
`)

// Team picker for the player/game add/edit forms - unpaginated on purpose,
// no real league runs anywhere near the 100-row cap this asks for. Fetched
// only by the Players/Games pages, not the Teams page or the league layout.
export const AdminTeamOptionsDocument = graphql(`
	query AdminTeamOptions($leagueId: ID!) {
		adminTeams(leagueId: $leagueId, first: 100) {
			__typename
			... on QueryAdminTeamsSuccess {
				data {
					items {
						id
						name
						abbreviation
					}
				}
			}
		}
	}
`)

export const AdminTeamsDocument = graphql(`
	query AdminTeams(
		$leagueId: ID!
		$sortBy: AdminTeamSort
		$sortDir: SortDirection
		$after: String
	) {
		adminTeams(
			leagueId: $leagueId
			sortBy: $sortBy
			sortDir: $sortDir
			after: $after
			first: 100
		) {
			__typename
			... on QueryAdminTeamsSuccess {
				data {
					items {
						id
						name
						abbreviation
						color
						conference
						division
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

export const AdminPlayersDocument = graphql(`
	query AdminPlayers(
		$leagueId: ID!
		$sortBy: AdminPlayerSort
		$sortDir: SortDirection
		$after: String
	) {
		adminPlayers(
			leagueId: $leagueId
			sortBy: $sortBy
			sortDir: $sortDir
			after: $after
			first: 100
		) {
			__typename
			... on QueryAdminPlayersSuccess {
				data {
					items {
						id
						name
						position
						currentTeam {
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

// Lines tab.
export const AdminLineSettingsDocument = graphql(`
	query AdminLineSettings {
		adminLineSettings {
			__typename
			... on QueryAdminLineSettingsSuccess {
				data {
					leagueSlug
					templateId
					statName
					isCustom
					autoTune
					tunedAt
					line {
						shade
						minLine
						minGames
					}
					defaultLine {
						shade
						minLine
						minGames
					}
					calibration {
						resolved
						overRate
						averageLine
						averageBlendedMean
						outsideTarget
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

// Bands tab.
export const AdminBandSettingsDocument = graphql(`
	query AdminBandSettings {
		adminBandSettings {
			__typename
			... on QueryAdminBandSettingsSuccess {
				data {
					leagueSlug
					templateId
					statName
					isCustom
					autoTune
					tunedAt
					tolerance {
						mode
						value
					}
					defaultTolerance {
						mode
						value
					}
					calibration {
						samples
						hitRate
						suggestedBand
						targetHitRate
						outsideTarget
						callerCalls
						callerHitRate
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

// Leaders tab.
export const AdminLeaderLossSettingsDocument = graphql(`
	query AdminLeaderLossSettings {
		adminLeaderLossSettings {
			__typename
			... on QueryAdminLeaderLossSettingsSuccess {
				data {
					leagueSlug
					templateId
					statName
					lossRate
					defaultLossRate
					isCustom
					autoTune
					tunedAt
					calibration {
						resolved
						favoriteHitRate
						suggestedLossRate
						callerPicks
						callerHitRate
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

// Users tab.
export const AdminUsersDocument = graphql(`
	query AdminUsers(
		$search: String
		$sortBy: AdminUserSort
		$sortDir: SortDirection
	) {
		adminUsers(search: $search, sortBy: $sortBy, sortDir: $sortDir) {
			__typename
			... on QueryAdminUsersSuccess {
				data {
					id
					name
					username
					strikeCount
					questionCreationEnabled
					isVerifiedPundit
					careerStats {
						totalPoints
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

export const AdminUserVoidHistoryDocument = graphql(`
	query AdminUserVoidHistory($userId: ID!) {
		adminUserVoidHistory(userId: $userId) {
			__typename
			... on QueryAdminUserVoidHistorySuccess {
				data {
					id
					questionTitle
					reason
					createdAt
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

// League-scoped, like adminTeams/adminPlayers above - no other games list
// query exists (Question.game is the only other way to reach a game).
export const AdminGamesDocument = graphql(`
	query AdminGames(
		$leagueId: ID!
		$sortBy: AdminGameSort
		$sortDir: SortDirection
		$after: String
	) {
		adminGames(
			leagueId: $leagueId
			sortBy: $sortBy
			sortDir: $sortDir
			after: $after
			first: 100
		) {
			__typename
			... on QueryAdminGamesSuccess {
				data {
					items {
						id
						startsAt
						status
						homeScore
						awayScore
						homeTeam {
							id
							name
							abbreviation
						}
						awayTeam {
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
