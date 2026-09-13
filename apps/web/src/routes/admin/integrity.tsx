import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { IntegrityCreatorModal } from "#/components/admin/integrity-creator-modal"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { AdminSelfGradingReportDocument } from "#/graphql/queries/integrity"
import { gqlQueryOptions } from "#/graphql/query-options"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/integrity")({
	component: RouteComponent,
})

const columns = [
	{ key: "user", label: "User", sortable: false },
	{ key: "graded", label: "Self-graded", numeric: true, sortable: false },
	{ key: "own", label: "Own calls", numeric: true, sortable: false },
	{ key: "record", label: "Own W-L", sortable: false },
	{ key: "ownPoints", label: "Own pts", numeric: true, sortable: false },
	{ key: "total", label: "Total pts", numeric: true, sortable: false },
	{ key: "overturned", label: "Overturned", numeric: true, sortable: false },
	{ key: "actions", label: "", sortable: false },
] as const

// Ranked server-side by the points a creator's own calls earned on questions
// they resolved themselves (see lib/self-grading-report.ts in the API), so
// the table has a fixed order and nothing to sort.
function RouteComponent() {
	const { data } = useQuery(gqlQueryOptions(AdminSelfGradingReportDocument, {}))
	const rows =
		data?.adminSelfGradingReport.__typename ===
		"QueryAdminSelfGradingReportSuccess"
			? data.adminSelfGradingReport.data
			: []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Integrity"
				subtitle="Points creators earned calling questions they resolved themselves."
			/>

			<Table sortBy="ownPoints" sortDir="desc">
				<Table.Head columns={[...columns]} />
				<Table.Body>
					{rows.map((row) => (
						<Table.Row key={row.userId}>
							<Table.Cell>@{row.username}</Table.Cell>
							<Table.Cell numeric>{row.handGradedCount}</Table.Cell>
							<Table.Cell numeric>{row.ownCallCount}</Table.Cell>
							<Table.Cell>
								{row.ownCallWins}-{row.ownCallLosses}
							</Table.Cell>
							<Table.Cell numeric>{row.ownCallPoints}</Table.Cell>
							<Table.Cell numeric>{row.totalPoints}</Table.Cell>
							<Table.Cell numeric>{row.overturnedCount}</Table.Cell>
							<Table.Cell numeric>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										openModal(<IntegrityCreatorModal creator={row} />)
									}
								>
									Callers
								</Button>
							</Table.Cell>
						</Table.Row>
					))}
				</Table.Body>
			</Table>
		</VStack>
	)
}
