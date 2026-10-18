import { graphql } from "#/graphql/generated"

export const AdminDismissCommentReportDocument = graphql(`
	mutation AdminDismissCommentReport($reportId: ID!) {
		adminDismissCommentReport(reportId: $reportId) {
			__typename
		}
	}
`)

export const AdminRemoveCommentDocument = graphql(`
	mutation AdminRemoveComment($reportId: ID!) {
		adminRemoveComment(reportId: $reportId) {
			__typename
		}
	}
`)
