import { graphql } from "#/graphql/generated"
import {
	EMPTY_CONNECTION,
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"

export const QuestionDetailDocument = graphql(`
	query QuestionDetail($id: ID!) {
		question(id: $id) {
			id
			title
			shape
			isOfficial
			status
			locksAt
			resolvedAt
			resolutionNote
			hasSettledDispute
			ouLine
			numericActualValue
			numericTolerancePct
			numericToleranceAbsolute
			stat {
				id
				toleranceTier {
					id
					toleranceMode
					toleranceValue
				}
			}
			numericHitRatePct
			averageGuess
			callCount
			resolutionSource
			resolutionSourceUrl
			league {
				id
				abbreviation
				slug
			}
			options {
				id
				label
				fieldPct
				isCorrect
				callCount
			}
			creator {
				id
				name
				username
			}
			game {
				id
				...GameStarters_game
				questionCount
				status
				startsAt
				homeScore
				awayScore
				venue
				homeTeam {
					id
					name
					abbreviation
					color
				}
				awayTeam {
					id
					name
					abbreviation
					color
				}
				homeTeamRecord {
					wins
					losses
					ties
				}
				awayTeamRecord {
					wins
					losses
					ties
				}
			}
			guessDistribution {
				value
				count
			}
			viewerCall {
				id
				createdAt
				guessValue
				conviction
				totalPoints
				currentRank
				seasonGamesPlayed
				seasonTotalGames
				closenessMult
				closenessFieldPct
				caseText
				question {
					id
					shape
					ouLine
				}
				selections {
					id
					conviction
					resultPoints
					option {
						id
						label
						isCorrect
						fieldPct
					}
				}
			}
			viewerDispute {
				id
				status
			}
			viewerReport {
				id
			}
			viewerSharedGroupIds
			# Read unmasked by the page's breadcrumb (BallotStrip selects its
			# own copy of this membership for the strip itself) - a ballot
			# question's trail names the ballot it was published as part of.
			ballotMembership {
				id
				ballot {
					id
					name
					slug
				}
			}
			...CastCallForm_question
			...ResolveQuestionModal_question
			...BallotStrip_question
		}
	}
`)

export const QuestionCallsDocument = graphql(`
	query QuestionCalls($id: ID!, $after: String) {
		question(id: $id) {
			id
			calls(first: 10, after: $after) {
				items {
					id
					...CallRow_call
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
`)

export const questionDetailQuery = (id: string) =>
	gqlQueryOptions(QuestionDetailDocument, { id })

export const questionCallsQuery = (id: string) =>
	gqlInfiniteQueryOptions(
		QuestionCallsDocument,
		{ id },
		(data) => data.question?.calls ?? EMPTY_CONNECTION,
	)
