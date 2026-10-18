import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import type { SummaryRow as SummaryRowData } from "#/lib/stat-context"

// One line of StatContextSummary: whose figure it is, then the figure and
// what it's over.
export function SummaryRow({ row }: { row: SummaryRowData }) {
	return (
		<HStack justify="space-between" gap="3">
			<span className={css({ fontSize: "sm", minWidth: "0", truncate: true })}>
				{row.name}
			</span>
			<HStack gap="2" alignItems="baseline" flexShrink="0">
				<span className={css({ fontFamily: "heading", fontSize: "lg" })}>
					{row.value}
				</span>
				<span className={css({ textStyle: "labelSm", color: "fg.subtle" })}>
					{row.label}
				</span>
			</HStack>
		</HStack>
	)
}
