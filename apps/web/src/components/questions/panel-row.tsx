import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

type Props = {
	label: string
	value: ReactNode
}

// One row in a label/value info panel (RESOLVES, LOCKS, etc. on the question
// detail page). Padding and the separator border are driven by DOM position
// (:first-child/:last-child) rather than a caller-supplied flag - a row
// can't get this wrong by being added, removed, or reordered; the caller
// just renders however many rows it has and the ends sort themselves out.
export function PanelRow({ label, value }: Props) {
	return (
		<HStack
			justify="space-between"
			className={css({
				paddingBlock: "2.5",
				borderBottom: "1px solid {colors.border.default}",
				_first: { paddingTop: "0" },
				_last: { paddingBottom: "0", borderBottom: "none" },
			})}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
			<span className={css({ fontFamily: "mono", fontSize: "xs" })}>
				{value}
			</span>
		</HStack>
	)
}
