import { useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Table, type TableColumn } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import {
	DeleteBallotDocument,
	invalidateBallots,
	ReorderBallotsDocument,
} from "#/graphql/ballots/mutations"
import type { AdminBallotSort, BallotStatus } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"

type ColumnKey =
	| "position"
	| "move"
	| "name"
	| "league"
	| "members"
	| "status"
	| "actions"

const BROWSE_COLUMNS: TableColumn<ColumnKey>[] = [
	{ key: "name", label: "Ballot" },
	{ key: "league", label: "League", sortable: false },
	{ key: "members", label: "Members", numeric: true, sortable: false },
	{ key: "status", label: "Status" },
	{ key: "actions", label: "", sortable: false },
]

// Nothing is sortable here - the point of this mode is the order stored on the
// rows, so a header that reorders the view out from under the ↑/↓ buttons would
// only be a way to lose your place. League drops off too, being the same on
// every row once the list is scoped to one.
const ORDERING_COLUMNS: TableColumn<ColumnKey>[] = [
	{ key: "position", label: "#", sortable: false, width: "3rem" },
	{ key: "move", label: "", sortable: false, width: "6rem" },
	{ key: "name", label: "Ballot", sortable: false },
	{ key: "members", label: "Members", numeric: true, sortable: false },
	{ key: "status", label: "Status", sortable: false },
	{ key: "actions", label: "", sortable: false },
]

type SortKey = "name" | "status"

const SORT_KEY_TO_ENUM: Record<SortKey, AdminBallotSort> = {
	name: "NAME",
	status: "STATUS",
}
const SORT_ENUM_TO_KEY: Record<AdminBallotSort, SortKey> = {
	NAME: "name",
	STATUS: "status",
	CREATED_AT: "name",
	SORT_ORDER: "name",
}

type BallotRow = {
	id: string
	name: string
	status: BallotStatus
	memberCount: number
	sortOrder: number
	league: { id: string; name: string; abbreviation: string }
}

export function AdminBallotsTable({
	items,
	loading,
	isOrdering,
	leagueId,
	seasonId,
	sortBy,
	sortDir,
	onSort,
}: {
	items: BallotRow[]
	loading: boolean
	isOrdering: boolean
	leagueId: string
	seasonId: string | null
	sortBy: AdminBallotSort
	sortDir: "asc" | "desc"
	onSort: (sort: AdminBallotSort) => void
}) {
	const queryClient = useQueryClient()
	const deleteBallot = useGqlMutation(DeleteBallotDocument)
	const reorderBallots = useGqlMutation(ReorderBallotsDocument)

	async function handleDelete(ballot: BallotRow) {
		if (
			!window.confirm(
				`Delete "${ballot.name}"? Its questions stay exactly as they are - only the grouping goes away.`,
			)
		) {
			return
		}
		await deleteBallot.mutateAsync({ id: ballot.id })
		await invalidateBallots(queryClient)
	}

	// Sends the whole ordered set, not the one ballot that moved - same shape
	// as the builder page's member reordering, and what lets the server reject
	// anything that isn't exactly this scope's current ballots.
	async function move(index: number, direction: "up" | "down") {
		if (!seasonId) return
		const target = direction === "up" ? index - 1 : index + 1
		if (target < 0 || target >= items.length) return
		const reordered = [...items]
		;[reordered[index], reordered[target]] = [
			reordered[target],
			reordered[index],
		]
		await reorderBallots.mutateAsync({
			leagueId,
			seasonId,
			orderedBallotIds: reordered.map((ballot) => ballot.id),
		})
		await invalidateBallots(queryClient)
	}

	return (
		<Table
			sortBy={isOrdering ? "name" : SORT_ENUM_TO_KEY[sortBy]}
			sortDir={sortDir}
			onSort={
				isOrdering
					? undefined
					: (key: ColumnKey) => onSort(SORT_KEY_TO_ENUM[key as SortKey])
			}
		>
			<Table.Head columns={isOrdering ? ORDERING_COLUMNS : BROWSE_COLUMNS} />
			<Table.Body>
				{items.map((ballot, i) => (
					<Table.Row key={ballot.id}>
						{isOrdering && (
							<>
								<Table.Cell>
									<span
										className={css({
											textStyle: "metaLg",
											color: "fg.subtle",
										})}
									>
										{i + 1}
									</span>
								</Table.Cell>
								<Table.Cell>
									<HStack gap="1">
										<Button
											variant="ghost"
											size="sm"
											disabled={i === 0 || loading}
											onClick={() => move(i, "up")}
										>
											↑
										</Button>
										<Button
											variant="ghost"
											size="sm"
											disabled={i === items.length - 1 || loading}
											onClick={() => move(i, "down")}
										>
											↓
										</Button>
									</HStack>
								</Table.Cell>
							</>
						)}
						<Table.Cell>
							<Link
								className={css({ _hover: { textDecoration: "underline" } })}
								to="/admin/ballots/$ballotId"
								params={{ ballotId: ballot.id }}
							>
								{ballot.name}
							</Link>
						</Table.Cell>
						{!isOrdering && (
							<Table.Cell>{ballot.league.abbreviation}</Table.Cell>
						)}
						<Table.Cell numeric>{ballot.memberCount}</Table.Cell>
						<Table.Cell>
							<Tag
								variant={ballot.status === "PUBLISHED" ? "primary" : undefined}
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
	)
}
