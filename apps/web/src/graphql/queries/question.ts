import { graphql } from "#/graphql/generated"

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
			numericHitRatePct
			averageGuess
			callCount
			resolutionSource
			resolutionSourceUrl
			league {
				id
				abbreviation
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
				status
				startsAt
				homeScore
				awayScore
				homeTeam {
					id
					abbreviation
					color
				}
				awayTeam {
					id
					abbreviation
					color
				}
			}
			guessDistribution {
				value
				count
			}
			viewerCall {
				id
				guessValue
				conviction
				totalPoints
				currentRank
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
			...CastCallForm_question
			...ResolveQuestionModal_question
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
