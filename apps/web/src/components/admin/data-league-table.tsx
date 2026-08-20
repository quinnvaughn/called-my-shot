import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"
import { Table } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { openModal } from "#/stores/modal-store"
import { AddEditLeagueModal } from "./data-entity-modal"

type League = {
	id: string
	name: string
	abbreviation: string
	slug: string
	status: string
	sport: { id: string; name: string }
}

type SortKey = "NAME" | "STATUS"

const columns = [
	{ key: "name", label: "League" },
	{ key: "sport", label: "Sport", sortable: false },
	{ key: "status", label: "Status" },
	{ key: "actions", label: "", sortable: false },
] as const

export function DataLeagueTable({
	leagues,
	sports,
	sortBy,
	sortDir,
	onSort,
	onSaved,
}: {
	leagues: League[]
	sports: { id: string; name: string }[]
	sortBy: SortKey
	sortDir: "asc" | "desc"
	onSort: (key: SortKey) => void
	onSaved: () => void
}) {
	return (
		<Table
			sortBy={sortBy === "STATUS" ? "status" : "name"}
			sortDir={sortDir}
			onSort={(key) => onSort(key === "status" ? "STATUS" : "NAME")}
		>
			<Table.Head columns={[...columns]} />
			<Table.Body>
				{leagues.map((league) => (
					<Table.Row key={league.id}>
						<Table.Cell>
							<Link
								to="/admin/data/$leagueId"
								params={{ leagueId: league.id }}
								className={css({
									textDecoration: "underline",
									cursor: "pointer",
									fontWeight: "bold",
								})}
							>
								{league.name}
							</Link>
						</Table.Cell>
						<Table.Cell>{league.sport.name}</Table.Cell>
						<Table.Cell>
							<Tag variant={league.status === "ACTIVE" ? "success" : "neutral"}>
								{league.status === "ACTIVE" ? "Active" : "Coming soon"}
							</Tag>
						</Table.Cell>
						<Table.Cell numeric>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									openModal(
										<AddEditLeagueModal
											sports={sports}
											league={league}
											onSaved={onSaved}
										/>,
									)
								}
							>
								Edit
							</Button>
						</Table.Cell>
					</Table.Row>
				))}
			</Table.Body>
		</Table>
	)
}
