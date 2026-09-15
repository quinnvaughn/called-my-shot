import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FiCheck } from "react-icons/fi"
import { HStack, VStack } from "styled-system/jsx"
import { LeaderLossSettingModal } from "#/components/admin/leader-loss-setting-modal"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { AdminLeaderLossSettingsDocument } from "#/graphql/queries/admin"
import { gqlQueryOptions } from "#/graphql/query-options"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/leaders")({
	component: RouteComponent,
})

const columns = [
	{ key: "stat", label: "Stat", sortable: false },
	{ key: "resolved", label: "Resolved", numeric: true, sortable: false },
	{ key: "favorite", label: "Favorite led", numeric: true, sortable: false },
	{ key: "suggested", label: "Suggested", numeric: true, sortable: false },
	{ key: "callers", label: "Callers", numeric: true, sortable: false },
	{ key: "autoTune", label: "Auto-tune", numeric: true, sortable: false },
	{ key: "lossRate", label: "Loss rate", numeric: true, sortable: false },
	{ key: "actions", label: "", sortable: false },
] as const

const percent = (rate: number) => `${Math.round(rate * 100)}%`

function RouteComponent() {
	const { data, refetch } = useQuery(
		gqlQueryOptions(AdminLeaderLossSettingsDocument, {}),
	)

	const rows =
		data?.adminLeaderLossSettings.__typename ===
		"QueryAdminLeaderLossSettingsSuccess"
			? data.adminLeaderLossSettings.data
			: []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Leaders"
				subtitle="What a miss costs on a game stat leader question."
				description="A leader question's loss rate is working when a pick on the favorite, the contender with the best season average in the stat across both teams, breaks even. A favorite who leads a quarter of the time breaks even at a loss rate of 33%. Each rate adjusts itself once a day as leader questions resolve, unless it's set to manual. Favorite led counts only questions posted with a favorite. Callers is how real picks on resolved questions did, for comparison only."
			/>

			<Table sortBy="stat" sortDir="asc" wide>
				<Table.Head columns={[...columns]} />
				<Table.Body>
					{rows.map((row) => (
						<Table.Row key={`${row.leagueSlug}:${row.statName}`}>
							<Table.Cell>
								{row.leagueSlug.toUpperCase()} {row.statName}
							</Table.Cell>
							<Table.Cell numeric>{row.calibration.resolved}</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.favoriteHitRate !== null
									? percent(row.calibration.favoriteHitRate)
									: "-"}
							</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.suggestedLossRate !== null
									? percent(row.calibration.suggestedLossRate)
									: "-"}
							</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.callerHitRate !== null
									? `${percent(row.calibration.callerHitRate)} of ${row.calibration.callerPicks}`
									: "-"}
							</Table.Cell>
							<Table.Cell numeric>
								{row.autoTune ? (
									<HStack justify="flex-end">
										<FiCheck aria-label="Adjusted automatically" />
									</HStack>
								) : (
									"-"
								)}
							</Table.Cell>
							<Table.Cell numeric>{percent(row.lossRate)}</Table.Cell>
							<Table.Cell numeric>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										openModal(
											<LeaderLossSettingModal
												setting={row}
												onChanged={() => refetch()}
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
		</VStack>
	)
}
