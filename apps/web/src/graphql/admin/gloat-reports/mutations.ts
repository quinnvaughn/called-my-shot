import { graphql } from "#/graphql/generated"

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
