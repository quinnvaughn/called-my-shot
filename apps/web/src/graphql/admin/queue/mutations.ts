import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	AdminBallotDocument,
	AdminDisputesDocument,
	AdminFrequentCoCallersDocument,
	AdminQuestionsDocument,
	AdminQueueSummaryDocument,
	AdminReportsDocument,
	AdminSelfGradingReportDocument,
	AdminUsersDocument,
	AdminUserVoidHistoryDocument,
	BallotAttachableQuestionsDocument,
	QuestionDetailDocument,
} from "#/graphql/generated/graphql"
import { invalidateOperations } from "#/graphql/query-options"

// Everything a resolve, void, dispute ruling, report dismissal or title edit
// can change: the queue and its tabs, the question list, strikes and void
// history, the self-grading report, ballots listing the question, and the
// question page itself.
export function invalidateAdminQueue(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		AdminQueueSummaryDocument,
		AdminQuestionsDocument,
		AdminDisputesDocument,
		AdminReportsDocument,
		AdminUsersDocument,
		AdminUserVoidHistoryDocument,
		AdminSelfGradingReportDocument,
		AdminFrequentCoCallersDocument,
		AdminBallotDocument,
		BallotAttachableQuestionsDocument,
		QuestionDetailDocument,
	])
}

export const VoidQuestionDocument = graphql(`
	mutation VoidQuestion($input: VoidQuestionInput!) {
		voidQuestion(input: $input) {
			__typename
			... on VoidQuestionPayload {
				questionId
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const AdminMarkQuestionVoidedDocument = graphql(`
	mutation AdminMarkQuestionVoided($input: AdminMarkQuestionVoidedInput!) {
		adminMarkQuestionVoided(input: $input) {
			__typename
			... on QuestionPayload {
				question {
					id
					status
					voidedReason
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const EditQuestionTitleDocument = graphql(`
	mutation EditQuestionTitle($input: EditQuestionTitleInput!) {
		editQuestionTitle(input: $input) {
			__typename
			... on QuestionPayload {
				question {
					id
					title
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const DeleteQuestionDocument = graphql(`
	mutation DeleteQuestion($input: DeleteQuestionInput!) {
		deleteQuestion(input: $input) {
			__typename
			... on DeleteQuestionPayload {
				questionId
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const AdminResolveQuestionDocument = graphql(`
	mutation AdminResolveQuestion($input: AdminResolveQuestionInput!) {
		adminResolveQuestion(input: $input) {
			__typename
			... on QuestionPayload {
				question {
					id
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const OverturnDisputeDocument = graphql(`
	mutation OverturnDispute($input: OverturnDisputeInput!) {
		overturnDispute(input: $input) {
			__typename
			... on QuestionPayload {
				question {
					id
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const UpholdDisputeDocument = graphql(`
	mutation UpholdDispute($input: UpholdDisputeInput!) {
		upholdDispute(input: $input) {
			__typename
			... on ResolutionDispute {
				id
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const DismissReportDocument = graphql(`
	mutation DismissReport($input: DismissReportInput!) {
		dismissReport(input: $input) {
			__typename
			... on QuestionReport {
				id
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
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
