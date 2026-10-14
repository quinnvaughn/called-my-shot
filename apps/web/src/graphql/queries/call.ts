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
			# The caller's presser on this call's game, for the excerpt under the
			# record card.
			presser {
				id
				statement
				answeredCount
				owner {
					id
					username
				}
				game {
					id
				}
			}
			presserQuestions {
				id
				body
				answer
				noComment
			}
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
				# Only official questions are on the caller's picks page for the
				# game, so only they link to it.
				isOfficial
				# A ballot question links to the caller's entry on its ballot.
				ballotMembership {
					id
					ballot {
						id
						name
						slug
					}
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
				# The matchup card under the title. A game question's title
				# ("Who will win?") leaves out which game; this is where it says.
				game {
					id
					status
					startsAt
					homeScore
					awayScore
					venue
					statusDetail
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
							...Team_team @unmask
						}
						awayTeam {
							...Team_team @unmask
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
	}
`)

export const callRecordQuery = (id: string) =>
	gqlQueryOptions(CallRecordDocument, { id })
