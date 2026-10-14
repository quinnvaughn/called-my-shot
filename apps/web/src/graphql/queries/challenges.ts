import { graphql } from "#/graphql/generated"
import type { ChallengeRole } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"

export const ChallengePersonFragment = graphql(`
	fragment ChallengePerson_user on User {
		id
		username
		name
		avatarUrl
	}
`)

export const GloatFragment = graphql(`
	fragment Gloat_gloat on Gloat {
		id
		createdAt
		removed
		text
		gif {
			id
			url
			width
			height
			alt
		}
		sender {
			...ChallengePerson_user @unmask
		}
	}
`)

// A 1v1 as the list on a challenge shows it: who, and the points so far.
export const ChallengeMatchupSummaryFragment = graphql(`
	fragment ChallengeMatchupSummary_matchup on ChallengeMatchup {
		id
		acceptedAt
		creatorPoints
		acceptorPoints
		outcome
		acceptor {
			...ChallengePerson_user @unmask
		}
	}
`)

// A 1v1 question by question, for the receipt, with any gloats on it.
export const ChallengeMatchupRowsFragment = graphql(`
	fragment ChallengeMatchupRows_matchup on ChallengeMatchup {
		id
		creatorGloat {
			...Gloat_gloat @unmask
		}
		acceptorGloat {
			...Gloat_gloat @unmask
		}
		rows {
			creatorPoints
			acceptorPoints
			question {
				id
				title
				status
			}
			creatorCall {
				...CallSummary_call @unmask
			}
			acceptorCall {
				...CallSummary_call @unmask
			}
		}
	}
`)

// A question in a challenge, with everything its card shows and the
// creator's call on it.
export const ChallengeEntryFragment = graphql(`
	fragment ChallengeEntry_entry on ChallengeEntry {
		question {
			id
			title
			status
			locksAt
			callCount
			...QuestionSummaryHeader_question
			...CastCallForm_question
			viewerCall {
				...CallSummary_call @unmask
			}
			game {
				id
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
			}
		}
		creatorCall {
			...CallSummary_call @unmask
		}
		creatorPoints
	}
`)

export const ChallengePageDocument = graphql(`
	query ChallengePage($code: String!) {
		challenge(code: $code) {
			id
			code
			state
			closesAt
			createdAt
			acceptanceCount
			viewerCanAccept
			viewerMissingQuestionIds
			viewerCanGloat
			creatorGloat {
				...Gloat_gloat @unmask
			}
			creator {
				...ChallengePerson_user @unmask
			}
			creatorTally {
				wins
				losses
				draws
			}
			viewerHeadToHead {
				wins
				losses
				draws
			}
			entries {
				...ChallengeEntry_entry @unmask
			}
			viewerMatchup {
				...ChallengeMatchupSummary_matchup @unmask
				...ChallengeMatchupRows_matchup @unmask
			}
			matchups(first: 100) {
				...ChallengeMatchupSummary_matchup @unmask
			}
		}
	}
`)

export const challengePageQuery = (code: string) =>
	gqlQueryOptions(ChallengePageDocument, { code })

export const ChallengeReceiptDocument = graphql(`
	query ChallengeReceipt($code: String!, $username: String!) {
		challenge(code: $code) {
			id
			code
			state
			creator {
				...ChallengePerson_user @unmask
			}
			entries {
				...ChallengeEntry_entry @unmask
			}
			matchup(username: $username) {
				...ChallengeMatchupSummary_matchup @unmask
				...ChallengeMatchupRows_matchup @unmask
			}
		}
	}
`)

export const challengeReceiptQuery = (code: string, username: string) =>
	gqlQueryOptions(ChallengeReceiptDocument, { code, username })

// What the builder can put in a challenge.
export const ChallengeCandidatesDocument = graphql(`
	query ChallengeCandidates($gameId: ID, $questionId: ID) {
		challengeCandidates(gameId: $gameId, questionId: $questionId) {
			id
			title
			locksAt
			league {
				id
				abbreviation
			}
			game {
				id
				startsAt
				awayTeam {
					abbreviation
				}
				homeTeam {
					abbreviation
				}
			}
			viewerCall {
				...CallSummary_call @unmask
			}
		}
		myGroups {
			id
			name
		}
	}
`)

export const challengeCandidatesQuery = (
	gameId: string | null,
	questionId: string | null,
) => gqlQueryOptions(ChallengeCandidatesDocument, { gameId, questionId })

export const ChallengeListItemFragment = graphql(`
	fragment ChallengeListItem_challenge on Challenge {
		id
		code
		state
		closesAt
		createdAt
		acceptanceCount
		creator {
			...ChallengePerson_user @unmask
		}
		creatorTally {
			wins
			losses
			draws
		}
		entries {
			question {
				id
				status
				game {
					id
					startsAt
					homeTeam {
						id
						abbreviation
					}
					awayTeam {
						id
						abbreviation
					}
				}
			}
			creatorPoints
		}
		viewerMatchup {
			...ChallengeMatchupSummary_matchup @unmask
		}
	}
`)

export const MyChallengesDocument = graphql(`
	query MyChallenges($role: ChallengeRole!) {
		myChallenges(role: $role) {
			...ChallengeListItem_challenge @unmask
		}
	}
`)

export const myChallengesQuery = (role: ChallengeRole) =>
	gqlQueryOptions(MyChallengesDocument, { role })

// GIFs for a gloat: a search, or what's trending without one.
export const GifSearchDocument = graphql(`
	query GifSearch($query: String, $page: Int) {
		gifsEnabled
		gifSearch(query: $query, page: $page) {
			id
			url
			previewUrl
			width
			height
			alt
		}
	}
`)

export const gifSearchQuery = (query: string) =>
	gqlQueryOptions(GifSearchDocument, { query: query || null, page: 1 })

// The viewer's groups, for posting a challenge into them.
export const ChallengePostGroupsDocument = graphql(`
	query ChallengePostGroups {
		myGroups {
			id
			name
		}
	}
`)
