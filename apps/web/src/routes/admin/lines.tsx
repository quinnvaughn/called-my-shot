import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FiCheck } from "react-icons/fi"
import { HStack, VStack } from "styled-system/jsx"
import { LineSettingModal } from "#/components/admin/line-setting-modal"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { adminLineSettingsQuery } from "#/graphql/admin/calibration/queries"
import { formatPercent } from "#/lib/format-number"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/lines")({
	component: RouteComponent,
	loader: ({ context }) => context.queryClient.query(adminLineSettingsQuery),
})

const columns = [
	{ key: "template", label: "Template", sortable: false },
	{ key: "resolved", label: "Resolved", numeric: true, sortable: false },
	{ key: "over", label: "Over hit", numeric: true, sortable: false },
	{ key: "averageLine", label: "Avg line", numeric: true, sortable: false },
	{ key: "autoTune", label: "Auto-tune", numeric: true, sortable: false },
	{ key: "shade", label: "Shade", numeric: true, sortable: false },
	{ key: "minLine", label: "Lowest line", numeric: true, sortable: false },
	{ key: "minGames", label: "Min games", numeric: true, sortable: false },
	{ key: "actions", label: "", sortable: false },
] as const

function RouteComponent() {
	const { data } = useSuspenseQuery(adminLineSettingsQuery)

	const rows =
		data.adminLineSettings.__typename === "QueryAdminLineSettingsSuccess"
			? data.adminLineSettings.data
			: []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Lines"
				subtitle="Generated over/unders and how their lines land."
				description="A template's lines are working when the over hits between 45% and 55% of the time. Each shade adjusts itself once a day as lines resolve, unless the template is set to manual. Over hit counts only lines set at the current shade. Team score and game total lines come from the game model instead: each sits where the over is closest to even across past games replayed at that game's expected scores, so a game's team lines, total and winner agree. Their shade only applies before there's enough history for the model."
			/>

			<Table sortBy="template" sortDir="asc" wide>
				<Table.Head columns={[...columns]} />
				<Table.Body>
					{rows.map((row) => (
						<Table.Row key={`${row.leagueSlug}:${row.templateId}`}>
							<Table.Cell>
								{row.leagueSlug.toUpperCase()} {row.templateId}
							</Table.Cell>
							<Table.Cell numeric>{row.calibration?.resolved ?? 0}</Table.Cell>
							<Table.Cell numeric>
								{row.calibration ? (
									<HStack gap="2" justify="flex-end">
										{row.calibration.outsideTarget && (
											<Tag variant="primary">Off target</Tag>
										)}
										{formatPercent(row.calibration.overRate)}
									</HStack>
								) : (
									"-"
								)}
							</Table.Cell>
							<Table.Cell numeric>
								{row.calibration?.averageLine ?? "-"}
							</Table.Cell>
							<Table.Cell numeric>
								{row.autoTune && !row.setByGameModel ? (
									<HStack justify="flex-end">
										<FiCheck aria-label="Adjusted automatically" />
									</HStack>
								) : (
									"-"
								)}
							</Table.Cell>
							<Table.Cell numeric>
								{row.setByGameModel ? (
									<HStack gap="2" justify="flex-end">
										<Tag variant="secondary">Game model</Tag>
										{row.line.shade}
									</HStack>
								) : (
									row.line.shade
								)}
							</Table.Cell>
							<Table.Cell numeric>{row.line.minLine}</Table.Cell>
							<Table.Cell numeric>{row.line.minGames}</Table.Cell>
							<Table.Cell numeric>
								<Button
									variant="outline"
									size="sm"
									onClick={() => openModal(<LineSettingModal setting={row} />)}
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
