import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { TextInput } from "#/components/ui/text-input"
import { AdminGroupsDocument } from "#/graphql/admin/groups/queries"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useDebouncedValue } from "#/hooks/use-debounced-value"

export const Route = createFileRoute("/admin/groups")({
	component: RouteComponent,
})

const columns = [
	{ key: "group", label: "Group", sortable: false },
	{ key: "members", label: "Members", numeric: true, sortable: false },
	{ key: "created", label: "Created", sortable: false },
] as const

function RouteComponent() {
	const [search, setSearch] = useState("")
	const debouncedSearch = useDebouncedValue(search, 300)

	const { data } = useQuery(
		gqlQueryOptions(AdminGroupsDocument, {
			search: debouncedSearch || undefined,
		}),
	)

	const groups =
		data?.adminGroups.__typename === "QueryAdminGroupsSuccess"
			? data.adminGroups.data
			: []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Groups"
				subtitle="Every group, newest first. Open one to view it without joining."
			/>

			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						placeholder="Search by name…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>

			<Table sortBy="created" sortDir="desc">
				<Table.Head columns={[...columns]} />
				<Table.Body>
					{groups.map((group) => (
						<Table.Row key={group.id}>
							<Table.Cell>
								<Link
									to="/groups/$groupId"
									params={{ groupId: group.id }}
									className={css({
										color: "fg.default",
										textDecoration: "underline",
									})}
								>
									{group.name}
								</Link>
							</Table.Cell>
							<Table.Cell numeric>{group.memberCount}</Table.Cell>
							<Table.Cell>
								{DateTime.fromISO(group.createdAt).toLocaleString(
									DateTime.DATE_MED,
								)}
							</Table.Cell>
						</Table.Row>
					))}
				</Table.Body>
			</Table>
		</VStack>
	)
}
