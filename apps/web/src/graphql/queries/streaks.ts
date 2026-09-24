import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"
import type { StreakFamilyValue } from "#/lib/streak-meta"

// Everything a streak page needs. Both runs are selected because a track
// whose current run has ended leads with its best one instead.
export const UserStreakPageDocument = graphql(`
	query UserStreakPage(
		$username: String!
		$league: String!
		$family: StreakFamily!
	) {
		userByUsername(username: $username) {
			id
			name
			username
			avatarUrl
			streak(league: $league, family: $family) {
				family
				familyLabel
				currentLength
				bestLength
				bestIsCurrent
				nextMilestone
				currentColdLength
				worstColdLength
				worstColdIsCurrent
				coldStartedAt
				league {
					id
					abbreviation
					slug
				}
				currentRunCalls {
					id
					createdAt
					...CallCard_call
					...StreakRecordCard_lastHit
				}
				bestRunCalls {
					id
					createdAt
					...CallCard_call
					...StreakRecordCard_lastHit
				}
				coldRunCalls {
					id
					createdAt
					...CallCard_call
					...StreakRecordCard_lastHit
				}
				worstColdRunCalls {
					id
					createdAt
					...CallCard_call
					...StreakRecordCard_lastHit
				}
			}
		}
	}
`)

export const userStreakPageQuery = (
	username: string,
	league: string,
	family: StreakFamilyValue,
) => gqlQueryOptions(UserStreakPageDocument, { username, league, family })

// Everything a sweep page needs. game.startsAt sits outside the fragments
// because the page's meta states the slate's dates before anything renders.
export const UserSweepPageDocument = graphql(`
	query UserSweepPage(
		$username: String!
		$league: String!
		$slateKey: String!
	) {
		userByUsername(username: $username) {
			id
			name
			username
			avatarUrl
			sweep(league: $league, slateKey: $slateKey) {
				slateKey
				slateLabel
				gameCount
				points
				league {
					id
					abbreviation
					slug
				}
				calls {
					id
					question {
						id
						game {
							id
							startsAt
						}
					}
					...CallCard_call
					...SweepRecordCard_call
				}
			}
		}
	}
`)

export const userSweepPageQuery = (
	username: string,
	league: string,
	slateKey: string,
) => gqlQueryOptions(UserSweepPageDocument, { username, league, slateKey })
