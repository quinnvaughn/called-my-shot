import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

// The wrapper every highlights list shares: its label, its "see all", and the
// rows or the empty line under them.
export function HighlightList({
	label,
	onSeeAll,
	children,
}: {
	label: string
	// Omitted when there's nothing more to see than what's already shown.
	onSeeAll?: () => void
	children: ReactNode
}) {
	return (
		<VStack alignItems="stretch" gap="2">
			{/*
			 * The label and its "see all" sat in the same mono/muted style, so
			 * across a two-column row they ran together into one line of text and
			 * this column's action read as the next column's heading. The label
			 * leads in the body font at full contrast; the action stays small and
			 * quiet beside it.
			 */}
			<HStack justify="space-between" alignItems="baseline" gap="4">
				<h3
					className={css({
						fontSize: "sm",
						fontWeight: "semibold",
						color: "fg.default",
					})}
				>
					{label}
				</h3>
				{onSeeAll && (
					<button
						type="button"
						onClick={onSeeAll}
						className={css({
							flexShrink: "0",
							textStyle: "label",
							color: "fg.subtle",
							cursor: "pointer",
							_hover: { color: "fg.default" },
						})}
					>
						See all →
					</button>
				)}
			</HStack>
			{children}
		</VStack>
	)
}
