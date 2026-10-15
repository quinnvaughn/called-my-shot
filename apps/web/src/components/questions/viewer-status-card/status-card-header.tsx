import type { ReactNode } from "react"
import { HStack } from "styled-system/jsx"
import { kickerClass } from "./styles"

// Every face opens with this row: what the card is about on the left, where
// it stands on the right.
export function StatusCardHeader({
	label,
	tag,
}: {
	label: string | null
	tag: ReactNode
}) {
	return (
		<HStack justify={label ? "space-between" : "flex-end"} gap="3">
			{label && <span className={kickerClass}>{label}</span>}
			{tag}
		</HStack>
	)
}
