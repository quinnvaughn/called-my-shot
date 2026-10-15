import { FiCheck } from "react-icons/fi"
import { HStack, VStack } from "styled-system/jsx"
import { LossSettingModal } from "#/components/admin/loss-setting-modal"
import type {
	LossSettingConfig,
	LossSettingRow,
} from "#/components/admin/loss-settings"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { formatPercent } from "#/lib/format-number"
import { openModal } from "#/stores/modal-store"

type Props<TInput> = {
	config: LossSettingConfig<TInput>
	rows: LossSettingRow[]
}

// Every league's loss rate for one kind of question, against how the pick
// it's tuned around has done.
export function LossSettingsPage<TInput>({ config, rows }: Props<TInput>) {
	const columns = [
		{ key: "name", label: config.nameLabel, sortable: false },
		{ key: "resolved", label: "Resolved", numeric: true, sortable: false },
		{
			key: "baseline",
			label: config.baselineLabel,
			numeric: true,
			sortable: false,
		},
		{ key: "blended", label: "Blended", numeric: true, sortable: false },
		{ key: "suggested", label: "Suggested", numeric: true, sortable: false },
		{ key: "callers", label: "Callers", numeric: true, sortable: false },
		{ key: "autoTune", label: "Auto-tune", numeric: true, sortable: false },
		{ key: "lossRate", label: "Loss rate", numeric: true, sortable: false },
		{ key: "actions", label: "", sortable: false },
	] as const

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title={config.title}
				subtitle={config.subtitle}
				description={config.description}
			/>

			<Table sortBy="name" sortDir="asc" wide>
				<Table.Head columns={[...columns]} />
				<Table.Body>
					{rows.map((row) => (
						<Table.Row key={`${row.leagueSlug}:${row.name}`}>
							<Table.Cell>
								{row.leagueSlug.toUpperCase()} {row.name}
							</Table.Cell>
							<Table.Cell numeric>{row.calibration.resolved}</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.baselineHitRate !== null
									? formatPercent(row.calibration.baselineHitRate)
									: "-"}
							</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.blendedHitRate !== null
									? formatPercent(row.calibration.blendedHitRate)
									: "-"}
							</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.suggestedLossRate !== null
									? formatPercent(row.calibration.suggestedLossRate)
									: "-"}
							</Table.Cell>
							<Table.Cell numeric>
								{row.calibration.callerHitRate !== null
									? `${formatPercent(row.calibration.callerHitRate)} of ${row.calibration.callerPicks}`
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
							<Table.Cell numeric>{formatPercent(row.lossRate)}</Table.Cell>
							<Table.Cell numeric>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										openModal(
											<LossSettingModal config={config} setting={row} />,
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
