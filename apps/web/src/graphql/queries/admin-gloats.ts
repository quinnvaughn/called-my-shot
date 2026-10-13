import { graphql } from "#/graphql/generated"

export const AdminGloatReportsDocument = graphql(`
	query AdminGloatReports {
		adminGloatReports {
			id
			reason
			details
			createdAt
			challengeCode
			reporter {
				id
				username
			}
			gloat {
				id
				text
				gif {
					url
					alt
				}
				sender {
					id
					username
				}
			}
		}
	}
`)

export const AdminDismissGloatReportDocument = graphql(`
	mutation AdminDismissGloatReport($reportId: ID!) {
		adminDismissGloatReport(reportId: $reportId) {
			__typename
		}
	}
`)

export const AdminRemoveGloatDocument = graphql(`
	mutation AdminRemoveGloat($reportId: ID!) {
		adminRemoveGloat(reportId: $reportId) {
			__typename
		}
	}
`)
