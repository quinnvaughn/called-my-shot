import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FiCheck } from "react-icons/fi"
import { HStack, VStack } from "styled-system/jsx"
import { TitleLossSettingModal } from "#/components/admin/title-loss-setting-modal"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { AdminTitleLossSettingsDocument } from "#/graphql/queries/admin"
import { gqlQueryOptions } from "#/graphql/query-options"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/titles")({
	component: RouteComponent,
})

const columns = [
	{ key: "title", label: "Title", sortable: false },
	{ key: "resolved", label: "Resolved", numeric: true, sortable: false },
	{ key: "best", label: "Best record won", numeric: true, sortable: false },
	{ key: "blended", label: "Blended", numeric: true, sortable: false },
	{ key: "suggested", label: "Suggested", numeric: true, sortable: false },
	{ key: "callers", label: "Callers", numeric: true, sortable: false },
	{ key: "autoTune", label: "Auto-tune", numeric: true, sortable: false },
	{ key: "lossRate", label: "Loss rate", numeric: true, sortable: false },
	{ key: "actions", label: "", sortable: false },
] as const

const percent = (rate: number) => `${Math.round(rate * 100)}%`

function RouteComponent() {
	const { data, refetch } = useQuery(
		gqlQueryOptions(AdminTitleLossSettingsDocument, {}),
	)

	const rows =
		data?.adminTitleLossSettings.__typename ===
		"QueryAdminTitleLossSettingsSuccess"
			? data.adminTitleLossSettings.data
			: []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Titles"
				subtitle="What a miss costs on a single-pick title question."
				description="A title's loss rate is working when a pick on the team with the best regular-season record in the pool comes out slightly ahead. Best record won is this league title's own record, read off each finished season. Blended leans that record on every other league's titles until it has enough of its own, and is what the rate is tuned from, once a day, unless it's set to manual. Callers is how real picks on resolved questions did, for comparison only. A title asked with several picks keeps the full rate and isn't listed."
			/>

			<Table sortBy="title" sortDir="asc" wide>
				<Table.Head columns={[...columns]} />
				<Table.Body>
					{rows.map((row) => (
						<Table.Row key={`${row.leagueSlug}:${row.awardName}`}>
							<Table.Cell>
								{row.leagueSlug.toUpperCase()} {row.awardName}
							</Table.Cell>
							<Table.Cell numeric>{row.calibration.resolved}</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.bestRecordHitRate !== null
									? percent(row.calibration.bestRecordHitRate)
									: "-"}
							</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.blendedHitRate !== null
									? percent(row.calibration.blendedHitRate)
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
											<TitleLossSettingModal
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
