import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "styled-system/recipes"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { adminUpdatesQuery } from "#/graphql/updates/queries"
import { formatCallDate } from "#/lib/format-date"

export const Route = createFileRoute("/admin/updates/")({
	component: RouteComponent,
	loader: ({ context }) => context.queryClient.query(adminUpdatesQuery),
})

const columns = [
	{ key: "title", label: "Update", sortable: false },
	{ key: "status", label: "Status", sortable: false },
	{ key: "published", label: "Published", sortable: false },
] as const

// Product updates: posts announcing a feature, shown at /updates and emailed
// to everyone subscribed when sent from the editor.
function RouteComponent() {
	const { data } = useSuspenseQuery(adminUpdatesQuery)
	const updates =
		data.adminUpdates.__typename === "QueryAdminUpdatesSuccess"
			? data.adminUpdates.data
			: []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Updates"
				subtitle="Feature announcements for the updates page and email."
				action={
					<Link
						to="/admin/updates/new"
						className={button({ variant: "solid", size: "sm" })}
					>
						New update
					</Link>
				}
			/>
			{updates.length === 0 ? (
				<EmptyState>No updates yet.</EmptyState>
			) : (
				<Table sortBy="title" sortDir="asc" wide>
					<Table.Head columns={[...columns]} />
					<Table.Body>
						{updates.map((update) => (
							<Table.Row key={update.id}>
								<Table.Cell>
									<Link
										to="/admin/updates/$updateId"
										params={{ updateId: update.id }}
										className={css({
											fontWeight: "medium",
											_hover: { textDecoration: "underline" },
										})}
									>
										{update.title}
									</Link>
								</Table.Cell>
								<Table.Cell>
									{update.emailedAt ? (
										<Tag variant="secondary" size="sm">
											Emailed
										</Tag>
									) : update.publishedAt ? (
										<Tag variant="success" size="sm">
											Published
										</Tag>
									) : (
										<Tag variant="neutral" size="sm">
											Draft
										</Tag>
									)}
								</Table.Cell>
								<Table.Cell>
									{update.publishedAt
										? formatCallDate(update.publishedAt)
										: "-"}
								</Table.Cell>
							</Table.Row>
						))}
					</Table.Body>
				</Table>
			)}
		</VStack>
	)
}
