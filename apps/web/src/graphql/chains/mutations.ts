import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	ChainCandidatesDocument,
	ChainCommentsDocument,
	ChainPageDocument,
	GroupChainCandidatesDocument,
	GroupChainsDocument,
	GroupFinishedChainsDocument,
	GroupShellDocument,
} from "#/graphql/generated/graphql"
import { invalidateOperations } from "#/graphql/query-options"

export const StartChainDocument = graphql(`
	mutation StartChain($input: StartChainInput!) {
		startChain(input: $input) {
			__typename
			... on ChainPayload {
				chain {
					id
				}
			}
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const RequestChainLinkDocument = graphql(`
	mutation RequestChainLink($input: RequestChainLinkInput!) {
		requestChainLink(input: $input) {
			__typename
			... on ChainPayload {
				chain {
					id
				}
			}
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const ApproveChainLinkDocument = graphql(`
	mutation ApproveChainLink($linkId: ID!) {
		approveChainLink(linkId: $linkId) {
			__typename
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const DeclineChainLinkDocument = graphql(`
	mutation DeclineChainLink($linkId: ID!) {
		declineChainLink(linkId: $linkId) {
			__typename
			... on Error {
				message
			}
		}
	}
`)

export const LeaveChainDocument = graphql(`
	mutation LeaveChain($chainId: ID!) {
		leaveChain(chainId: $chainId) {
			__typename
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const CallOffChainDocument = graphql(`
	mutation CallOffChain($chainId: ID!) {
		callOffChain(chainId: $chainId) {
			__typename
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const SendChainCommentDocument = graphql(`
	mutation SendChainComment($input: SendChainCommentInput!) {
		sendChainComment(input: $input) {
			__typename
			... on ChainCommentPayload {
				comment {
					id
				}
			}
			... on Error {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

// Every read that shows a chain: its page, the group's list and tab count,
// and the call pickers.
const CHAIN_DOCUMENTS = [
	ChainPageDocument,
	ChainCommentsDocument,
	ChainCandidatesDocument,
	GroupChainCandidatesDocument,
	GroupChainsDocument,
	GroupFinishedChainsDocument,
	GroupShellDocument,
]

export function invalidateChain(queryClient: QueryClient) {
	return invalidateOperations(queryClient, CHAIN_DOCUMENTS)
}

// The message a failed chain mutation shows.
export function chainErrorMessage(
	result:
		| {
				__typename: string
				message?: string
				fieldErrors?: { message: string }[]
		  }
		| null
		| undefined,
): string {
	return (
		result?.fieldErrors?.[0]?.message ??
		result?.message ??
		"Something went wrong. Try again."
	)
}
