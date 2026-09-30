import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// Everything /calls/:id needs to state one call as a record.
//
// stat.toleranceTier is not optional decoration: isRateStat reads it, and
// pickSummary reads isRateStat, so without it a rate stat renders ".3"
// instead of ".300".
export const CallRecordDocument = graphql(`
	query CallRecord($id: ID!) {
		call(id: $id) {
			id
			createdAt
			conviction
			caseText
			guessValue
			totalPoints
			currentRank
			# With the fields below, what a pending call's "if right / if
			# wrong" preview needs - the same inputs the question page's
			# status card reads.
			seasonGamesPlayed
			seasonTotalGames
			streak {
				length
				family
				familyLabel
			}
			# The full before/after. Fetched here and nowhere else: a feed only
			# needs to know a redo happened, this page is where there's room to
			# show what was abandoned.
			redo {
				id
				redoneAt
				originalCreatedAt
				originalGuessValue
				originalConviction
				originalCaseText
				originalSelections {
					id
					conviction
					option {
						id
						label
						isCorrect
						actualValue
					}
				}
			}
			viewerCanRedo
			fadeOffer {
				mode
				option {
					id
					label
				}
			}
			doubters {
				...DoubtersPanel_fade
			}
			viewerGloat {
				audience
				count
				fadeId
				targetUsername
			}
			# Stated on the record card itself: whose call this one faded, how
			# that went, and the line the winner sent.
			fading {
				id
				targetFlippedAt
				winner
				gloat
				target {
					id
					user {
						id
						username
					}
				}
			}
			user {
				id
				name
				username
				avatarUrl
			}
			question {
				id
				title
				shape
				status
				locksAt
				resolvedAt
				callCount
				lossRate
				options {
					id
				}
				ouLine
				numericActualValue
				numericToleranceAbsolute
				numericTolerancePct
				scoredOptions {
					id
					label
					actualValue
				}
				stat {
					id
					toleranceTier {
						id
						toleranceMode
						toleranceValue
					}
				}
				league {
					id
					abbreviation
					slug
				}
				game {
					id
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
			selections {
				id
				conviction
				resultPoints
				option {
					id
					label
					isCorrect
					fieldPct
					lossRate
					# This caller's own pick's number, which scoredOptions above
					# cannot give on a leader pool: that is trimmed to whoever led,
					# and the margin needs whoever they backed. f6ffc09 dropped this
					# in favour of scoredOptions for the Actual line; it is back for
					# a different question.
					actualValue
				}
			}
		}
	}
`)

export const callRecordQuery = (id: string) =>
	gqlQueryOptions(CallRecordDocument, { id })
