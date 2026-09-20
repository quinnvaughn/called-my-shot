import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// Everything /calls/:id needs to state one call as a record. Deliberately
// does NOT select user.email - it is ungated on the public User type, and
// this is a page anyone can open.
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
			streak {
				length
				family
				familyLabel
			}
			user {
				id
				name
				username
			}
			question {
				id
				title
				shape
				status
				locksAt
				resolvedAt
				callCount
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
					actualValue
					fieldPct
				}
			}
		}
	}
`)

export const callRecordQuery = (id: string) =>
	gqlQueryOptions(CallRecordDocument, { id })
