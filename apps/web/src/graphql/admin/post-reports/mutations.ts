import { graphql } from "#/graphql/generated"

export const AdminDismissPostReportDocument = graphql(`
	mutation AdminDismissPostReport($reportId: ID!) {
		adminDismissPostReport(reportId: $reportId) {
			__typename
			... on ValidationError {
				message
			}
			... on NotFoundError {
				message
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

// Takes the post down and closes every open report on it.
export const AdminRemovePostDocument = graphql(`
	mutation AdminRemovePost($reportId: ID!) {
		adminRemovePost(reportId: $reportId) {
			__typename
			... on ValidationError {
				message
			}
			... on NotFoundError {
				message
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

// Takes down the prompt the post answers, and every answer with it.
export const AdminRemovePromptDocument = graphql(`
	mutation AdminRemovePrompt($reportId: ID!) {
		adminRemovePrompt(reportId: $reportId) {
			__typename
			... on ValidationError {
				message
			}
			... on NotFoundError {
				message
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)
