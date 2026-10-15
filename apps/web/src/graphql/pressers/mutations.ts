import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	AdminPresserReportsDocument,
	BlockedUsersDocument,
	CallRecordDocument,
	ChallengePageDocument,
	ChallengeReceiptDocument,
	GameEntryDocument,
	GroupGameBoardDocument,
	GroupHomeDocument,
	MyChallengesDocument,
	NotificationsPageDocument,
	UserProfileDocument,
} from "#/graphql/generated/graphql"
import { invalidateOperations } from "#/graphql/query-options"

export const PostPresserStatementDocument = graphql(`
	mutation PostPresserStatement($input: PostPresserStatementInput!) {
		postPresserStatement(input: $input) {
			__typename
			... on PresserPayload {
				presser {
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

export const AskPresserQuestionDocument = graphql(`
	mutation AskPresserQuestion($input: AskPresserQuestionInput!) {
		askPresserQuestion(input: $input) {
			__typename
			... on PresserPayload {
				presser {
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

export const AnswerPresserQuestionDocument = graphql(`
	mutation AnswerPresserQuestion($input: AnswerPresserQuestionInput!) {
		answerPresserQuestion(input: $input) {
			__typename
			... on PresserPayload {
				presser {
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

export const ReportPresserContentDocument = graphql(`
	mutation ReportPresserContent($input: ReportPresserContentInput!) {
		reportPresserContent(input: $input) {
			__typename
			... on PresserReportPayload {
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

export const BlockUserDocument = graphql(`
	mutation BlockUser($username: String!) {
		blockUser(username: $username) {
			__typename
			... on BlockPayload {
				blocked
			}
			... on Error {
				message
			}
		}
	}
`)

export const UnblockUserDocument = graphql(`
	mutation UnblockUser($username: String!) {
		unblockUser(username: $username) {
			__typename
			... on BlockPayload {
				blocked
			}
			... on Error {
				message
			}
		}
	}
`)

export const AdminDismissPresserReportDocument = graphql(`
	mutation AdminDismissPresserReport($reportId: ID!) {
		adminDismissPresserReport(reportId: $reportId) {
			__typename
			... on Error {
				message
			}
		}
	}
`)

export const AdminRemovePresserContentDocument = graphql(`
	mutation AdminRemovePresserContent($reportId: ID!) {
		adminRemovePresserContent(reportId: $reportId) {
			__typename
			... on Error {
				message
			}
		}
	}
`)

// Every read that shows a presser: the call and game pages it hangs off, the
// owner's profile, a group's highlights, notifications and the admin reports.
const PRESSER_DOCUMENTS = [
	AdminPresserReportsDocument,
	CallRecordDocument,
	GameEntryDocument,
	GroupGameBoardDocument,
	GroupHomeDocument,
	NotificationsPageDocument,
	UserProfileDocument,
]

export function invalidatePressers(queryClient: QueryClient) {
	return invalidateOperations(queryClient, PRESSER_DOCUMENTS)
}

// A block works both ways on pressers (no asking, no answering) and challenges
// (no accepting, no gloating), and hides the blocked person's gloats from the
// viewer. Settings lists who's blocked.
export function invalidateAfterBlock(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		...PRESSER_DOCUMENTS,
		BlockedUsersDocument,
		ChallengePageDocument,
		ChallengeReceiptDocument,
		MyChallengesDocument,
	])
}
