import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { PostReportRow } from "#/components/admin/post-report-row"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import {
	AdminPostReportsDocument,
	adminPostReportsQuery,
} from "#/graphql/admin/post-reports/queries"
import { gqlQueryPrefix } from "#/graphql/query-options"

export const Route = createFileRoute("/admin/post-reports")({
	component: RouteComponent,
	loader: ({ context }) => context.queryClient.query(adminPostReportsQuery),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(adminPostReportsQuery)
	const queryClient = useQueryClient()
	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: gqlQueryPrefix(AdminPostReportsDocument),
		})
	const reports = data.adminPostReports

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Post reports"
				subtitle="Posts people flagged. Removing a post takes it down; removing a Rushmore prompt takes down every answer to it."
			/>
			{reports.length === 0 ? (
				<EmptyState>No open post reports.</EmptyState>
			) : (
				<VStack gap="3" alignItems="stretch">
					{reports.map((report) => (
						<PostReportRow key={report.id} report={report} onDone={refresh} />
					))}
				</VStack>
			)}
		</VStack>
	)
}
