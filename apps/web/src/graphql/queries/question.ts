import { graphql } from "#/graphql/generated"

export const QuestionDetailDocument = graphql(`
	query QuestionDetail($id: ID!) {
		question(id: $id) {
			id
			title
			type
			category
			isOfficial
			status
			locksAt
			resolvedAt
			resolutionNote
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
			}
			creator {
				id
				name
				username
			}
			subjectTeam {
				id
				abbreviation
				color
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
				caseText
				question {
					type
					ouLine
				}
				selections {
					id
					conviction
					option {
						id
						label
						isCorrect
					}
				}
			}
			viewerDispute {
				id
				status
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
