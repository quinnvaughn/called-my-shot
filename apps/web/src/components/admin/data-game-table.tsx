import { DateTime } from "luxon"
import { AddEditGameModal } from "#/components/admin/data-entity-modal/add-edit-game-modal"
import { Button } from "#/components/ui/button"
import { Table } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { matchupLabel } from "#/lib/game-status"
import { openModal } from "#/stores/modal-store"
import type { AdminGameRow, AdminTeamOption } from "./data-rows"

type SortKey = "STARTS_AT" | "STATUS"

const columns = [
	{ key: "matchup", label: "Matchup", sortable: false },
	{ key: "date", label: "Date" },
	{ key: "status", label: "Status" },
	{ key: "score", label: "Score", sortable: false },
	{ key: "actions", label: "", sortable: false },
] as const

const statusTag = {
	SCHEDULED: { variant: "neutral" as const, label: "Scheduled" },
	LIVE: { variant: "primary" as const, label: "Live" },
	FINAL: { variant: "neutral" as const, label: "Final" },
}

export function DataGameTable({
	games,
	leagueId,
	teams,
	sortBy,
	sortDir,
	onSort,
}: {
	games: AdminGameRow[]
	leagueId: string
	teams: AdminTeamOption[]
	sortBy: SortKey
	sortDir: "asc" | "desc"
	onSort: (key: SortKey) => void
}) {
	return (
		<Table
			sortBy={sortBy === "STATUS" ? "status" : "date"}
			sortDir={sortDir}
			onSort={(key) => onSort(key === "status" ? "STATUS" : "STARTS_AT")}
		>
			<Table.Head columns={[...columns]} />
			<Table.Body>
				{games.map((game) => {
					const tag = statusTag[game.status]
					return (
						<Table.Row key={game.id}>
							<Table.Cell>{matchupLabel(game)}</Table.Cell>
							<Table.Cell>
								{DateTime.fromISO(game.startsAt).toFormat(
									"ccc, LLL d 'at' h:mm a",
								)}
							</Table.Cell>
							<Table.Cell>
								<Tag variant={tag.variant}>{tag.label}</Tag>
							</Table.Cell>
							<Table.Cell>
								{game.status === "FINAL"
									? `${game.awayScore}–${game.homeScore}`
									: "-"}
							</Table.Cell>
							<Table.Cell numeric>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										openModal(
											<AddEditGameModal
												leagueId={leagueId}
												teams={teams}
												game={game}
											/>,
										)
									}
								>
									Edit
								</Button>
							</Table.Cell>
						</Table.Row>
					)
				})}
			</Table.Body>
		</Table>
	)
}
