import { graphql } from "#/graphql/generated"

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
