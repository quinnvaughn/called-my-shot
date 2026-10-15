import { graphql } from "#/graphql/generated"

// Redisplays the game field's current selection from just the stored gameId
// - normally served straight from the query cache (the game was already
// fetched via GamesByLeague), but a real network fallback if that cache
// entry isn't there, e.g. the field's own component remounted with no local
// memory of what it fetched before.
export const GameByIdDocument = graphql(`
	query GameById($id: ID!) {
		game(id: $id) {
			id
			...GameStarters_game
			startsAt
			status
			homeScore
			awayScore
			venue
			statusDetail
			windowKey
			viewerHasReminder
			openCommunityQuestionCount
			# The game rail's Community tab (GameSetRail).
			viewerCommunityQuestions {
				id
				...GameSetRail_question
			}
			viewerGroupBoards {
				callerCount
				group {
					id
					name
					logoUrl
				}
			}
			startTimeTbd
			postseason {
				roundLabel
				homeSeed
				awaySeed
				gameNumber
				bestOf
				ifNecessary
				summary
				clinchTeamIds
				seriesQuestions {
					id
					...QuestionCard_question
				}
			}
			league {
				id
				abbreviation
				slug
				windowType
			}
			homeTeam {
				...Team_team @unmask
			}
			awayTeam {
				...Team_team @unmask
			}
			homeTeamRecord {
				wins
				losses
				ties
				otLosses
			}
			awayTeamRecord {
				wins
				losses
				ties
				otLosses
			}
		}
	}
`)

// The game detail page's two tabs, split on isOfficial. Official: the hero
// (team_vs_team, the "who will win?" question synced onto the game by
// syncGameQuestions) plus the catalog questions generate-game-questions.ts
// posts, put in a fixed order client-side. Community: everything people wrote,
// sortable Most Called/New (see SortSwitcher) - every question on one game
// shares the same locksAt, so a Closing Soon sort would never do anything here.
export const GameQuestionsDocument = graphql(`
	query GameQuestions(
		$gameId: ID!
		$first: Int
		$after: String
		$sort: QuestionSortOrder
		$isOfficial: Boolean
	) {
		questions(
			gameId: $gameId
			first: $first
			after: $after
			sort: $sort
			isOfficial: $isOfficial
		) {
			items {
				id
				shape
				createdAt
				status
				locksAt
				# Read by the page itself for the Official tab's share section
				# (whether there's anything to share, and the tweet's record).
				viewerCall {
					id
					hitTolerance
					totalPoints
					selections {
						id
						option {
							id
							isCorrect
						}
					}
				}
				...QuestionCard_question
				...GameSetRail_question
			}
			pageInfo {
				hasNextPage
				endCursor
			}
		}
	}
`)

// The Official tab and the game winner card: the same items as
// GameQuestionsDocument plus what only a game page shows on a card (see
// GameCardExtras_question). The Community tab stays on the plain document.
export const GameOfficialQuestionsDocument = graphql(`
	query GameOfficialQuestions($gameId: ID!, $first: Int) {
		questions(gameId: $gameId, first: $first, isOfficial: true) {
			items {
				id
				shape
				createdAt
				status
				locksAt
				# Read by the page itself for the Official tab's share section
				# (whether there's anything to share, and the tweet's record).
				viewerCall {
					id
					hitTolerance
					totalPoints
					selections {
						id
						option {
							id
							isCorrect
						}
					}
				}
				...QuestionCard_question
				...GameSetRail_question
				...GameCardExtras_question
			}
		}
	}
`)

// /games/<id>/picks/<username> - one user's calls on a game's official
// questions. Public like the game page; `entry` is null for an unknown
// username or someone with no official calls on this game.
export const GameEntryDocument = graphql(`
	query GameEntry($id: ID!, $username: String!) {
		game(id: $id) {
			id
			startsAt
			status
			homeScore
			awayScore
			venue
			statusDetail
			windowKey
			startTimeTbd
			postseason {
				roundLabel
				homeSeed
				awaySeed
				gameNumber
				ifNecessary
				summary
				clinchTeamIds
			}
			league {
				id
				abbreviation
				slug
			}
			homeTeam {
				...Team_team @unmask
			}
			awayTeam {
				...Team_team @unmask
			}
			homeTeamRecord {
				wins
				losses
				ties
				otLosses
			}
			awayTeamRecord {
				wins
				losses
				ties
				otLosses
			}
			entry(username: $username) {
				calledCount
				wins
				losses
				points
				verdict
				presser {
					...PresserSection_presser
				}
				official {
					wins
					losses
					points
				}
				community {
					calledCount
					wins
					losses
					points
				}
				communityMembers {
					question {
						id
					}
					call {
						id
						...CallCard_call
					}
				}
				user {
					id
					name
					username
					avatarUrl
				}
				members {
					question {
						id
						title
						shape
						createdAt
						status
						locksAt
						stat {
							id
							name
						}
						subjectTeam {
							id
							abbreviation
						}
						subjectPlayer {
							id
							name
						}
						options {
							id
							label
						}
					}
					call {
						id
						...CallCard_call
					}
				}
			}
		}
	}
`)
