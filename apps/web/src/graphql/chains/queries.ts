import { graphql } from "#/graphql/generated"
import {
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"

// One link as every chain surface shows it: who, their pick on which game,
// its chance, and how it landed.
export const ChainLinkFragment = graphql(`
	fragment ChainLink_link on ChainLink {
		id
		status
		hitChance
		multiplier
		outcome
		award
		isBreaker
		user {
			id
			username
			...Identity_user
		}
		game {
			id
			status
			startsAt
			homeTeam {
				id
				abbreviation
				color
				logoUrl
			}
			awayTeam {
				id
				abbreviation
				color
				logoUrl
			}
		}
		call {
			id
			question {
				id
				title
			}
			totalPoints
			payout {
				winLow
				winHigh
			}
			...CallSummary_call
		}
	}
`)

// One chain as the group's list shows it.
graphql(`
	fragment ChainListRow_chain on Chain {
		id
		phase
		locksAt
		createdAt
		starter {
			id
			username
		}
		links {
			...ChainLink_link @unmask
		}
		viewerLink {
			id
			status
			multiplier
		}
		breaker {
			id
			user {
				id
				username
			}
		}
	}
`)

export const GroupChainsDocument = graphql(`
	query GroupChains($groupId: ID!) {
		group(id: $groupId) {
			id
			viewerIsMember
			activeChains {
				...ChainListRow_chain @unmask
			}
		}
	}
`)

export const FINISHED_CHAINS_PAGE = 10

// The group's held and broken chains, newest first, a page at a time.
export const GroupFinishedChainsDocument = graphql(`
	query GroupFinishedChains($groupId: ID!, $first: Int, $after: String) {
		group(id: $groupId) {
			id
			finishedChains(first: $first, after: $after) {
				items {
					...ChainListRow_chain @unmask
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
`)

const NO_CHAINS = {
	items: [],
	pageInfo: { hasNextPage: false, endCursor: null },
}

export const finishedChainsQuery = (groupId: string) =>
	gqlInfiniteQueryOptions(
		GroupFinishedChainsDocument,
		{ groupId, first: FINISHED_CHAINS_PAGE },
		(result) => result.group?.finishedChains ?? NO_CHAINS,
	)

export const groupChainsQuery = (groupId: string) =>
	gqlQueryOptions(GroupChainsDocument, { groupId })

graphql(`
	fragment ChainLinkCandidate_candidate on ChainLinkCandidate {
		hitChance
		reason
		call {
			id
			question {
				id
				title
				locksAt
			}
			...CallSummary_call
		}
	}
`)

export const GroupChainCandidatesDocument = graphql(`
	query GroupChainCandidates($groupId: ID!) {
		group(id: $groupId) {
			id
			viewerChainCandidates {
				...ChainLinkCandidate_candidate @unmask
			}
		}
	}
`)

export const ChainCandidatesDocument = graphql(`
	query ChainCandidates($chainId: ID!) {
		chain(id: $chainId) {
			id
			multiplierForNewLink
			viewerLinkCandidates {
				...ChainLinkCandidate_candidate @unmask
			}
		}
	}
`)

export const ChainPageDocument = graphql(`
	query ChainPage($chainId: ID!) {
		gifsEnabled
		chain(id: $chainId) {
			id
			phase
			locksAt
			createdAt
			viewerIsStarter
			viewerJoinBlockedReason
			multiplierForNewLink
			viewerCanComment
			group {
				id
				name
			}
			starter {
				id
				username
			}
			links {
				...ChainLink_link @unmask
			}
			viewerLink {
				id
				status
				multiplier
				hitChance
			}
			pendingRequests {
				...ChainLink_link @unmask
			}
			breaker {
				id
				user {
					id
					username
				}
			}
			events {
				kind
				at
				linkCount
				viewerMultiplier
				previousViewerMultiplier
				zeroedCount
				actor {
					id
					username
					name
					avatarUrl
				}
				link {
					...ChainLink_link @unmask
				}
			}
			commentCount
		}
	}
`)

export const chainPageQuery = (chainId: string) =>
	gqlQueryOptions(ChainPageDocument, { chainId })

// A page of a chain's chat, newest first: the panel opens on the latest and
// asks for older pages as it's scrolled up.
export const ChainCommentsDocument = graphql(`
	query ChainComments($chainId: ID!, $first: Int, $after: String) {
		chain(id: $chainId) {
			id
			comments(first: $first, after: $after) {
				items {
					id
					createdAt
					removed
					text
					gif {
						url
						width
						height
						alt
					}
					sender {
						id
						username
						name
						avatarUrl
					}
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
`)
