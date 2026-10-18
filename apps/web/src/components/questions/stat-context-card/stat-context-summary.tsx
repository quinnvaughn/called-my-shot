import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import type {
	StatContextCard_StatContextFragment,
	StatContextCard_TrackRecordFragment,
} from "#/graphql/generated/graphql"
import {
	sectionTitle,
	summaryRows,
	type TeamLabels,
} from "#/lib/stat-context"
import { openModal } from "#/stores/modal-store"
import { MismatchTag } from "./mismatch-tag"
import { StatContextSheet } from "./stat-context-sheet"
import { SummaryRow } from "./summary-row"

// The stats card folded to its headline figures, on a phone while there's
// still a call to make. Open in place, the full card runs past a screen and
// pushes the options out of reach; this keeps the number that matters most
// right above them, with the rest a sheet away.
export function StatContextSummary({
	context,
	trackRecord,
	teams,
}: {
	context: StatContextCard_StatContextFragment
	trackRecord: StatContextCard_TrackRecordFragment | null | undefined
	teams: TeamLabels
}) {
	const rows = summaryRows(context)

	return (
		<Card>
			<Card.Body>
				<VStack gap="2.5" alignItems="stretch">
					<HStack justify="space-between" alignItems="center" gap="2">
						<HStack gap="2" alignItems="center" minWidth="0">
							<h2
								className={css({
									textStyle: "sectionHeading",
									color: "fg.muted",
								})}
							>
								{sectionTitle(context.statLabel)}
							</h2>
							<MismatchTag show={context.mismatch} />
						</HStack>
						<button
							type="button"
							onClick={() =>
								openModal(
									<StatContextSheet
										context={context}
										trackRecord={trackRecord}
										teams={teams}
									/>,
								)
							}
							className={button({ variant: "ghost", size: "sm" })}
						>
							All stats
						</button>
					</HStack>
					{rows.map((row) => (
						<SummaryRow key={row.key} row={row} />
					))}
				</VStack>
			</Card.Body>
		</Card>
	)
}
