import { Button } from "#/components/ui/button"
import { Table } from "#/components/ui/table"
import { openModal } from "#/stores/modal-store"
import { AddEditPlayerModal } from "./data-entity-modal"

type Player = {
	id: string
	name: string
	position: string | null
	currentTeam: { id: string; name: string; abbreviation: string } | null
}
type TeamOption = { id: string; name: string; abbreviation: string }
type SortKey = "NAME" | "POSITION"

const columns = [
	{ key: "name", label: "Player" },
	{ key: "team", label: "Team", sortable: false },
	{ key: "position", label: "Position" },
	{ key: "actions", label: "", sortable: false },
] as const

export function DataPlayerTable({
	players,
	teams,
	sortBy,
	sortDir,
	onSort,
	onSaved,
}: {
	players: Player[]
	teams: TeamOption[]
	sortBy: SortKey
	sortDir: "asc" | "desc"
	onSort: (key: SortKey) => void
	onSaved: () => void
}) {
	return (
		<Table
			sortBy={sortBy === "POSITION" ? "position" : "name"}
			sortDir={sortDir}
			onSort={(key) => onSort(key === "position" ? "POSITION" : "NAME")}
		>
			<Table.Head columns={[...columns]} />
			<Table.Body>
				{players.map((player) => (
					<Table.Row key={player.id}>
						<Table.Cell>{player.name}</Table.Cell>
						<Table.Cell>{player.currentTeam?.abbreviation ?? "—"}</Table.Cell>
						<Table.Cell>{player.position ?? "—"}</Table.Cell>
						<Table.Cell numeric>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									openModal(
										<AddEditPlayerModal
											teams={teams}
											player={player}
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
