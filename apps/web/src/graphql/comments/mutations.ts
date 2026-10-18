import { graphql } from "#/graphql/generated"

export const ReportCommentDocument = graphql(`
	mutation ReportComment($input: ReportCommentInput!) {
		reportComment(input: $input) {
			__typename
			... on CommentReportPayload {
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
