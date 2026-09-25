import { targetHitRate, LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FiCheck } from "react-icons/fi"
import { HStack, VStack } from "styled-system/jsx"
import {
	BandSettingModal,
	formatTolerance,
} from "#/components/admin/band-setting-modal"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { AdminBandSettingsDocument } from "#/graphql/queries/admin"
import { gqlQueryOptions } from "#/graphql/query-options"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/bands")({
	component: RouteComponent,
})

const columns = [
	{ key: "stat", label: "Stat", sortable: false },
	{ key: "scores", label: "Scores", numeric: true, sortable: false },
	{ key: "hit", label: "Hit rate", numeric: true, sortable: false },
	{ key: "suggested", label: "Suggested", numeric: true, sortable: false },
	{ key: "callers", label: "Callers", numeric: true, sortable: false },
	{ key: "autoTune", label: "Auto-tune", numeric: true, sortable: false },
	{ key: "band", label: "Band", numeric: true, sortable: false },
	{ key: "actions", label: "", sortable: false },
] as const

const percent = (rate: number) => `${Math.round(rate * 100)}%`

const TARGET = targetHitRate(LOSS_RATE_BY_SHAPE.team_stat_numeric_guess)

function RouteComponent() {
	const { data, refetch } = useQuery(
		gqlQueryOptions(AdminBandSettingsDocument, {}),
	)

	const rows =
		data?.adminBandSettings.__typename === "QueryAdminBandSettingsSuccess"
			? data.adminBandSettings.data
			: []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Bands"
				subtitle="How close a team score guess has to land to count as a hit."
				description={`A band is working when a guess at a team's average over its earlier games that season lands inside it about ${percent(TARGET)} of the time, which is where a numeric guess comes out slightly ahead at its loss rate. Each band adjusts itself once a day from final scores, unless it's set to manual. Hit rate and Suggested read the most recent final scores. Callers is how real guesses on resolved questions did, for comparison only.`}
			/>

			<Table sortBy="stat" sortDir="asc" wide>
				<Table.Head columns={[...columns]} />
				<Table.Body>
					{rows.map((row) => (
						<Table.Row key={`${row.leagueSlug}:${row.statName}`}>
							<Table.Cell>
								{row.leagueSlug.toUpperCase()} {row.statName}
							</Table.Cell>
							<Table.Cell numeric>{row.calibration.samples}</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.hitRate !== null ? (
									<HStack gap="2" justify="flex-end">
										{row.calibration.outsideTarget && (
											<Tag variant="primary">Off target</Tag>
										)}
										{percent(row.calibration.hitRate)}
									</HStack>
								) : (
									"-"
								)}
							</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.suggestedBand !== null
									? `±${row.calibration.suggestedBand}`
									: "-"}
							</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.callerHitRate !== null
									? `${percent(row.calibration.callerHitRate)} of ${row.calibration.callerCalls}`
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
							<Table.Cell numeric>
								{row.tolerance ? formatTolerance(row.tolerance) : "-"}
							</Table.Cell>
							<Table.Cell numeric>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										openModal(
											<BandSettingModal
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
