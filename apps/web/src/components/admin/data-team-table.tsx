import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Table } from "#/components/ui/table"
import { openModal } from "#/stores/modal-store"
import { AddEditTeamModal } from "./data-entity-modal"

type Team = { id: string; name: string; abbreviation: string; color: string }
type SortKey = "NAME" | "ABBREVIATION"

const columns = [
	{ key: "name", label: "Team" },
	{ key: "abbreviation", label: "Abbreviation" },
	{ key: "color", label: "Color", sortable: false },
	{ key: "actions", label: "", sortable: false },
] as const

export function DataTeamTable({
	teams,
	leagueId,
	sortBy,
	sortDir,
	onSort,
	onSaved,
}: {
	teams: Team[]
	leagueId: string
	sortBy: SortKey
	sortDir: "asc" | "desc"
	onSort: (key: SortKey) => void
	onSaved: () => void
}) {
	return (
		<Table
			sortBy={sortBy === "ABBREVIATION" ? "abbreviation" : "name"}
			sortDir={sortDir}
			onSort={(key) => onSort(key === "abbreviation" ? "ABBREVIATION" : "NAME")}
		>
			<Table.Head columns={[...columns]} />
			<Table.Body>
				{teams.map((team) => (
					<Table.Row key={team.id}>
						<Table.Cell>{team.name}</Table.Cell>
						<Table.Cell>{team.abbreviation}</Table.Cell>
						<Table.Cell>
							<HStack gap="2" alignItems="center">
								<span
									className={css({
										display: "inline-block",
										width: "3.5",
										height: "3.5",
										borderRadius: "sm",
										border: "1px solid {colors.border.default}",
									})}
									style={{ backgroundColor: team.color }}
								/>
								{team.color}
							</HStack>
						</Table.Cell>
						<Table.Cell numeric>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									openModal(
										<AddEditTeamModal
											leagueId={leagueId}
											team={team}
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
