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
				team {
					...Team_team @unmask
				}
				player {
					id
					name
					headshotUrl
				}
			}
			# Winner first and already trimmed by shape, which the options list
			# above is not - the margin needs to know which side actually won.
			scoredOptions {
				id
				label
				actualValue
			}
			creator {
				id
				name
				username
				avatarUrl
			}
			...GameStrip_question
			# The rail beside a ballot question, from xl up (BallotSetRail).
			...BallotSetRail_question
			series {
				id
				roundLabel
				summary
				seeds {
					teamId
					seed
				}
				gameOne {
					id
					homeTeam {
						...Team_team @unmask
					}
					awayTeam {
						...Team_team @unmask
					}
				}
			}
			game {
				id
				...GameStarters_game
				status
				startsAt
				homeScore
				awayScore
				venue
				statusDetail
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
				# The rail beside the question, from xl up (GameSetRail).
				officialQuestions {
					id
					...GameSetRail_question
				}
				viewerCommunityQuestions {
					id
					...GameSetRail_question
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
				# Whether the redo CTA can show at all. Deliberately excludes
				# the viewer's balance, which is per-viewer rather than
				# per-call - see Call.viewerCanRedo.
				viewerCanRedo
				redo {
					id
				}
				currentRank
				seasonGamesPlayed
				seasonTotalGames
				closenessMult
				closenessFieldPct
				caseText
				seasonPlay {
					weight
					weeksPlayed
					weeksCounted
					settled
				}
				question {
					id
					shape
					isOfficial
					isPriced
					league {
						id
						abbreviation
					}
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
						crowdPct
						lossRate
						winMult
						modelHitRate
						# The viewer's own pick's number, which question.options
						# above can't stand in for on a leader pool - the margin
						# needs whoever they backed, not just whoever led.
						actualValue
						team {
							...Team_team @unmask
						}
						player {
							id
							name
							headshotUrl
						}
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
			viewerPinnedGroupIds
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
			...ViewerStatusCard_question
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
			viewerTrackRecord {
				...StatContextCard_trackRecord
			}
		}
	}
`)

export const questionStatContextQuery = (id: string) =>
	gqlQueryOptions(QuestionStatContextDocument, { id })

// The question a call's next-up step points at: the game page's line of
// recent form and group picks for it. Fetched only once a call has landed,
// never as part of the awaited detail query.
export const NextUpQuestionDocument = graphql(`
	query NextUpQuestion($id: ID!) {
		question(id: $id) {
			id
			...GameCardExtras_question
		}
	}
`)

export const nextUpQuestionQuery = (id: string) =>
	gqlQueryOptions(NextUpQuestionDocument, { id })
