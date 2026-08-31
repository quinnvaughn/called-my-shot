import { useApolloClient, useMutation } from "@apollo/client/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { NewBallotModal } from "#/components/admin/new-ballot-modal"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { TextInput } from "#/components/ui/text-input"
import type { AdminBallotSort, BallotStatus } from "#/graphql/generated/graphql"
import { DeleteBallotDocument } from "#/graphql/mutations/ballots"
import { AdminBallotsDocument } from "#/graphql/queries/ballots"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/ballots/")({
	component: RouteComponent,
})

const STATUS_FILTERS: { value: BallotStatus | null; label: string }[] = [
	{ value: null, label: "All" },
	{ value: "DRAFT", label: "Draft" },
	{ value: "PUBLISHED", label: "Published" },
]

const columns = [
	{ key: "name", label: "Ballot" },
	{ key: "league", label: "League", sortable: false },
	{ key: "members", label: "Members", numeric: true, sortable: false },
	{ key: "status", label: "Status" },
	{ key: "actions", label: "", sortable: false },
] as const

type SortKey = "name" | "status"

const SORT_KEY_TO_ENUM: Record<SortKey, AdminBallotSort> = {
	name: "NAME",
	status: "STATUS",
}
const SORT_ENUM_TO_KEY: Record<AdminBallotSort, SortKey> = {
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

type BallotRow = {
	id: string
	name: string
	status: BallotStatus
	memberCount: number
	league: { id: string; name: string; abbreviation: string }
}

function RouteComponent() {
	const client = useApolloClient()
	const [search, setSearch] = useState("")
	const [status, setStatus] = useState<BallotStatus | null>(null)
	const debouncedSearch = useDebouncedValue(search, 300)
	const [deleteBallot] = useMutation(DeleteBallotDocument)

	const {
		items,
		loading,
		hasNextPage,
		sortBy,
		sortDir,
		onSort,
		loadMore,
		reload,
	} = useAdminConnection<BallotRow, AdminBallotSort>({
		defaultSort: "NAME",
		fetchPage: async ({ sortBy: sb, sortDir: sd, after }) => {
			const { data } = await client.query({
				query: AdminBallotsDocument,
				variables: {
					search: debouncedSearch || undefined,
					status: status ?? undefined,
					sortBy: sb,
					sortDir: sd === "asc" ? "ASC" : "DESC",
					after,
				},
				fetchPolicy: "network-only",
			})
			if (data?.adminBallots.__typename !== "QueryAdminBallotsSuccess")
				return null
			return data.adminBallots.data
		},
	})

	// biome-ignore lint/correctness/useExhaustiveDependencies: reload is stable, see use-admin-connection.ts
	useEffect(() => {
		reload()
	}, [debouncedSearch, status])

	async function handleDelete(ballot: BallotRow) {
		if (
			!window.confirm(
				`Delete "${ballot.name}"? Its questions stay exactly as they are - only the grouping goes away.`,
			)
		) {
			return
		}
		await deleteBallot({ variables: { id: ballot.id } })
		reload()
	}

	return (
		<VStack gap="6" alignItems="stretch">
			<HStack justify="space-between" alignItems="flex-start" gap="4">
				<PageHeader
					title="Ballots"
					subtitle="Award ballots, a week of games - a set of questions people answer at their own pace."
				/>
				<Button
					variant="solid"
					size="sm"
					onClick={() => openModal(<NewBallotModal />)}
				>
					+ New ballot
				</Button>
			</HStack>
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						placeholder="Search ballots…"
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
					{items.map((ballot) => (
						<Table.Row key={ballot.id}>
							<Table.Cell>
								<Link
									className={css({ _hover: { textDecoration: "underline" } })}
									to="/admin/ballots/$ballotId"
									params={{ ballotId: ballot.id }}
								>
									{ballot.name}
								</Link>
							</Table.Cell>
							<Table.Cell>{ballot.league.abbreviation}</Table.Cell>
							<Table.Cell numeric>{ballot.memberCount}</Table.Cell>
							<Table.Cell>
								<Tag
									variant={
										ballot.status === "PUBLISHED" ? "primary" : undefined
									}
								>
									{ballot.status === "PUBLISHED" ? "Published" : "Draft"}
								</Tag>
							</Table.Cell>
							<Table.Cell numeric>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleDelete(ballot)}
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
