import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"

// One label/value line on a streak or sweep record card - the same row
// CallRecordCard states its stats with.
export function RecordStatRow({
	label,
	value,
}: {
	label: string
	value: ReactNode
}) {
	return (
		<HStack
			alignItems="flex-start"
			justify="space-between"
			gap="4"
			width="full"
		>
			<Eyebrow size="sm" variant="neutral">
				{label}
			</Eyebrow>
			<span
				className={css({
					fontSize: "sm",
					fontWeight: "semibold",
					textAlign: "right",
					minWidth: "0",
				})}
			>
				{value}
			</span>
		</HStack>
	)
}
