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
			payout {
				winLow
				winHigh
				lose
			}
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
				# The matchup card under the title. A game question's title
				# ("Who will win?") leaves out which game; this is where it says.
				game {
					id
					status
					startsAt
					homeScore
					awayScore
					venue
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
				# A series question's counterpart, for the same reason.
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
