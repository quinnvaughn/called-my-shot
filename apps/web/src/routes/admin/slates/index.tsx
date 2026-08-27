import { useApolloClient, useMutation } from "@apollo/client/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { NewSlateModal } from "#/components/admin/new-slate-modal"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { TextInput } from "#/components/ui/text-input"
import type { AdminSlateSort, SlateStatus } from "#/graphql/generated/graphql"
import { DeleteSlateDocument } from "#/graphql/mutations/slates"
import { AdminSlatesDocument } from "#/graphql/queries/slates"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/slates/")({
	component: RouteComponent,
})

const STATUS_FILTERS: { value: SlateStatus | null; label: string }[] = [
	{ value: null, label: "All" },
	{ value: "DRAFT", label: "Draft" },
	{ value: "PUBLISHED", label: "Published" },
]

const columns = [
	{ key: "name", label: "Slate" },
	{ key: "league", label: "League", sortable: false },
	{ key: "members", label: "Members", numeric: true, sortable: false },
	{ key: "status", label: "Status" },
	{ key: "actions", label: "", sortable: false },
] as const

type SortKey = "name" | "status"

const SORT_KEY_TO_ENUM: Record<SortKey, AdminSlateSort> = {
	name: "NAME",
	status: "STATUS",
}
const SORT_ENUM_TO_KEY: Record<AdminSlateSort, SortKey> = {
	NAME: "name",
	STATUS: "status",
	CREATED_AT: "name",
}

const filterPill = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	padding: "{spacing.1.5} {spacing.3}",
	borderRadius: "lg",
	border: "1px solid {colors.border.default}",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: { borderColor: "border.emphasized", color: "fg.default" },
})

const filterPillActive = css({
	borderColor: "fg.default",
	color: "bg.canvas",
	bg: "fg.default",
	_hover: { borderColor: "fg.default", color: "bg.canvas" },
})

type SlateRow = {
	id: string
	name: string
	status: SlateStatus
	memberCount: number
	league: { id: string; name: string; abbreviation: string }
}

function RouteComponent() {
	const client = useApolloClient()
	const [search, setSearch] = useState("")
	const [status, setStatus] = useState<SlateStatus | null>(null)
	const debouncedSearch = useDebouncedValue(search, 300)
	const [deleteSlate] = useMutation(DeleteSlateDocument)

	const {
		items,
		loading,
		hasNextPage,
		sortBy,
		sortDir,
		onSort,
		loadMore,
		reload,
	} = useAdminConnection<SlateRow, AdminSlateSort>({
		defaultSort: "NAME",
		fetchPage: async ({ sortBy: sb, sortDir: sd, after }) => {
			const { data } = await client.query({
				query: AdminSlatesDocument,
				variables: {
					search: debouncedSearch || undefined,
					status: status ?? undefined,
					sortBy: sb,
					sortDir: sd === "asc" ? "ASC" : "DESC",
					after,
				},
				fetchPolicy: "network-only",
			})
			if (data?.adminSlates.__typename !== "QueryAdminSlatesSuccess")
				return null
			return data.adminSlates.data
		},
	})

	// biome-ignore lint/correctness/useExhaustiveDependencies: reload is stable, see use-admin-connection.ts
	useEffect(() => {
		reload()
	}, [debouncedSearch, status])

	async function handleDelete(slate: SlateRow) {
		if (
			!window.confirm(
				`Delete "${slate.name}"? Its questions stay exactly as they are - only the grouping goes away.`,
			)
		) {
			return
		}
		await deleteSlate({ variables: { id: slate.id } })
		reload()
	}

	return (
		<VStack gap="6" alignItems="stretch">
			<HStack justify="space-between" alignItems="flex-start" gap="4">
				<PageHeader
					title="Slates"
					subtitle="Award ballots, a week of games - a set of questions people answer at their own pace."
				/>
				<Button
					variant="solid"
					size="sm"
					onClick={() => openModal(<NewSlateModal />)}
				>
					+ New slate
				</Button>
			</HStack>
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						placeholder="Search slates…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>
			<HStack gap="1.5" flexWrap="wrap">
				{STATUS_FILTERS.map((filter) => (
					<button
						key={filter.label}
						type="button"
						onClick={() => setStatus(filter.value)}
						className={cx(
							filterPill,
							status === filter.value && filterPillActive,
						)}
					>
						{filter.label}
					</button>
				))}
			</HStack>

			<Table
				sortBy={SORT_ENUM_TO_KEY[sortBy]}
				sortDir={sortDir}
				onSort={(key: SortKey) => onSort(SORT_KEY_TO_ENUM[key])}
			>
				<Table.Head columns={[...columns]} />
				<Table.Body>
					{items.map((slate) => (
						<Table.Row key={slate.id}>
							<Table.Cell>
								<Link
									className={css({ _hover: { textDecoration: "underline" } })}
									to="/admin/slates/$slateId"
									params={{ slateId: slate.id }}
								>
									{slate.name}
								</Link>
							</Table.Cell>
							<Table.Cell>{slate.league.abbreviation}</Table.Cell>
							<Table.Cell numeric>{slate.memberCount}</Table.Cell>
							<Table.Cell>
								<Tag
									variant={slate.status === "PUBLISHED" ? "primary" : undefined}
								>
									{slate.status === "PUBLISHED" ? "Published" : "Draft"}
								</Tag>
							</Table.Cell>
							<Table.Cell numeric>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleDelete(slate)}
								>
									Delete
								</Button>
							</Table.Cell>
						</Table.Row>
					))}
				</Table.Body>
			</Table>

			{hasNextPage && (
				<Button
					variant="outline"
					size="sm"
					loading={loading}
					onClick={loadMore}
				>
					Show more →
				</Button>
			)}
		</VStack>
	)
}
