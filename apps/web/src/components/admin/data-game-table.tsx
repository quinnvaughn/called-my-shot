import { DateTime } from "luxon"
import { Button } from "#/components/ui/button"
import { Table } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { openModal } from "#/stores/modal-store"
import { AddEditGameModal } from "./data-entity-modal"

type Game = {
	id: string
	startsAt: string
	status: "SCHEDULED" | "LIVE" | "FINAL"
	homeScore: number | null
	awayScore: number | null
	homeTeam: { id: string; name: string; abbreviation: string }
	awayTeam: { id: string; name: string; abbreviation: string }
}
type TeamOption = { id: string; name: string; abbreviation: string }
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
	FINAL: { variant: "success" as const, label: "Final" },
}

export function DataGameTable({
	games,
	leagueId,
	teams,
	sortBy,
	sortDir,
	onSort,
	onSaved,
}: {
	games: Game[]
	leagueId: string
	teams: TeamOption[]
	sortBy: SortKey
	sortDir: "asc" | "desc"
	onSort: (key: SortKey) => void
	onSaved: () => void
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
							<Table.Cell>
								{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
							</Table.Cell>
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
									: "—"}
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
												onSaved={onSaved}
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
