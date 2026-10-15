import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	ChallengePageDocument,
	ChallengePostGroupsDocument,
	ChallengeReceiptDocument,
	GroupHomeDocument,
	MyChallengesDocument,
} from "#/graphql/generated/graphql"
import { invalidateOperations } from "#/graphql/query-options"

export const CreateChallengeDocument = graphql(`
	mutation CreateChallenge($input: CreateChallengeInput!) {
		createChallenge(input: $input) {
			__typename
			... on ChallengePayload {
				challenge {
					id
					code
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

export const AcceptChallengeDocument = graphql(`
	mutation AcceptChallenge($input: AcceptChallengeInput!) {
		acceptChallenge(input: $input) {
			__typename
			... on ChallengePayload {
				challenge {
					id
					code
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

export const PostChallengeToGroupsDocument = graphql(`
	mutation PostChallengeToGroups($input: PostChallengeToGroupsInput!) {
		postChallengeToGroups(input: $input) {
			__typename
			... on ChallengePayload {
				challenge {
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

export const SendChallengeGloatDocument = graphql(`
	mutation SendChallengeGloat($input: SendChallengeGloatInput!) {
		sendChallengeGloat(input: $input) {
			__typename
			... on GloatSentPayload {
				gloat {
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

export const ReportGloatDocument = graphql(`
	mutation ReportGloat($input: ReportGloatInput!) {
		reportGloat(input: $input) {
			__typename
			... on GloatReportPayload {
				report {
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

// Every read that shows a challenge's posts or gloats: its own pages, the
// viewer's list, and the Home of the groups it's posted to.
const CHALLENGE_DOCUMENTS = [
	ChallengePageDocument,
	ChallengePostGroupsDocument,
	ChallengeReceiptDocument,
	GroupHomeDocument,
	MyChallengesDocument,
]

export function invalidateChallenges(queryClient: QueryClient) {
	return invalidateOperations(queryClient, CHALLENGE_DOCUMENTS)
}
