import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { UserDetailModal } from "#/components/admin/user-detail-modal"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { TextInput } from "#/components/ui/text-input"
import { AdminUsersDocument } from "#/graphql/admin/users/queries"
import type { AdminUserSort } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/users")({
	component: RouteComponent,
})

const columns = [
	{ key: "user", label: "User" },
	{ key: "points", label: "Points", numeric: true, sortable: false },
	{ key: "strikes", label: "Strikes", numeric: true },
	{ key: "verified", label: "Verified" },
	{ key: "creation", label: "Creation" },
	{ key: "actions", label: "", sortable: false },
] as const

type SortKey = "user" | "strikes" | "verified" | "creation"

const SORT_KEY_TO_ENUM: Record<SortKey, AdminUserSort> = {
	user: "USERNAME",
	strikes: "STRIKES",
	verified: "VERIFIED",
	creation: "CREATION_ENABLED",
}
const SORT_ENUM_TO_KEY: Record<AdminUserSort, SortKey> = {
	USERNAME: "user",
	STRIKES: "strikes",
	VERIFIED: "verified",
	CREATION_ENABLED: "creation",
}

function RouteComponent() {
	const [search, setSearch] = useState("")
	const [sortBy, setSortBy] = useState<AdminUserSort>("USERNAME")
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
	const debouncedSearch = useDebouncedValue(search, 300)

	const { data } = useQuery(
		gqlQueryOptions(AdminUsersDocument, {
			search: debouncedSearch || undefined,
			sortBy,
			sortDir: sortDir === "asc" ? "ASC" : "DESC",
		}),
	)

	function onSort(key: SortKey) {
		const enumKey = SORT_KEY_TO_ENUM[key]
		if (enumKey === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
		else {
			setSortBy(enumKey)
			setSortDir("asc")
		}
	}

	const users =
		data?.adminUsers.__typename === "QueryAdminUsersSuccess"
			? data.adminUsers.data
			: []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Users"
				subtitle="Strikes, verification, and question-creation access."
			/>

			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						placeholder="Search by handle…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>

			<Table
				sortBy={SORT_ENUM_TO_KEY[sortBy]}
				sortDir={sortDir}
				onSort={onSort}
			>
				<Table.Head columns={[...columns]} />
				<Table.Body>
					{users.map((user) => (
						<Table.Row key={user.id}>
							<Table.Cell>@{user.username}</Table.Cell>
							<Table.Cell numeric>
								{user.careerStats?.totalPoints ?? 0}
							</Table.Cell>
							<Table.Cell numeric>{user.strikeCount}</Table.Cell>
							<Table.Cell>
								{user.isVerifiedPundit ? (
									<Tag variant="success">Verified</Tag>
								) : (
									"-"
								)}
							</Table.Cell>
							<Table.Cell>
								<Tag
									variant={user.questionCreationEnabled ? "neutral" : "primary"}
								>
									{user.questionCreationEnabled ? "Enabled" : "Locked"}
								</Tag>
							</Table.Cell>
							<Table.Cell numeric>
								<Button
									variant="outline"
									size="sm"
									onClick={() => openModal(<UserDetailModal user={user} />)}
								>
									View
								</Button>
							</Table.Cell>
						</Table.Row>
					))}
				</Table.Body>
			</Table>
		</VStack>
	)
}
