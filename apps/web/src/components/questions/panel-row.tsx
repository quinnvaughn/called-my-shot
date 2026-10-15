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
					flexShrink: 0,
					whiteSpace: "nowrap",
				})}
			>
				{label}
			</span>
			{/* The label holds its width and the value absorbs any squeeze, so
			    a long value wraps within its own column instead of pushing the
			    label onto two lines. */}
			<span
				className={css({
					textStyle: "metaLg",
					display: "flex",
					justifyContent: "flex-end",
					minWidth: "0",
				})}
			>
				{value}
			</span>
		</HStack>
	)
}
