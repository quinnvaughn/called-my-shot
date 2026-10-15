import type { ReactNode, Ref } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

// The one shared shell every state renders into - the same plain card for
// all of them. What changed (pending, won, missed) lives in the corner tag
// and the numbers, so a call looks like the same object before and after it
// settles.
export function StatusCardShell({
	ref,
	children,
}: {
	ref?: Ref<HTMLDivElement>
	children: ReactNode
}) {
	return (
		<VStack
			ref={ref}
			gap="4"
			alignItems="stretch"
			className={css({
				position: "relative",
				borderRadius: "xl",
				padding: "5",
				// Clears the sticky top bar when scrolled to after a call.
				scrollMarginTop: "20",
				backgroundColor: "bg.surface",
				border: "1px solid {colors.border.default}",
			})}
		>
			{children}
		</VStack>
	)
}
