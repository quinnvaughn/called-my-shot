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
			voidedReason
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
			resolvesAutomatically
			league {
				id
				abbreviation
				slug
			}
			sport {
				id
			}
			options {
				id
				label
				fieldPct
				isCorrect
				actualValue
				callCount
			}
			creator {
				id
				name
				username
			}
			...GameStrip_question
			game {
				id
				...GameStarters_game
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
			viewerStreak {
				family
				familyLabel
				currentLength
				bestLength
			}
			viewerCall {
				id
				createdAt
				guessValue
				conviction
				totalPoints
				unscoredReason
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
					lossRate
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

// Its own document, deliberately not part of QuestionDetailDocument. The route
// loader awaits that one, so folding the cards in would let a slow card set
// hold up the pick form, which is the page's whole job. This is prefetched
// without awaiting instead. It's also why nothing in a feed should ever select
// statContext - it runs several queries per question.
export const QuestionStatContextDocument = graphql(`
	query QuestionStatContext($id: ID!) {
		question(id: $id) {
			id
			statContext {
				...StatContextCard_statContext
			}
		}
	}
`)

export const questionStatContextQuery = (id: string) =>
	gqlQueryOptions(QuestionStatContextDocument, { id })

// The same document for the landing page's try-it stack, which unmounts the
// card the moment a call advances it. That abort is its last observer going
// away rather than a superseded fetch, and the only thing it produces is a dev
// server `aborted` in the error overlay - see gqlQueryOptions. Same key as
// above, so the two share a cache entry.
export const guestPickStatContextQuery = (id: string) =>
	gqlQueryOptions(QuestionStatContextDocument, { id }, { abortable: false })
