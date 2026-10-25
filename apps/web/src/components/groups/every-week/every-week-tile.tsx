import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"

// One panel of the landing page's look at a group's week.
export function EveryWeekTile({
	eyebrow,
	children,
}: {
	eyebrow: string
	children: ReactNode
}) {
	return (
		<VStack
			gap="2.5"
			alignItems="stretch"
			className={css({
				backgroundColor: "bg.subtle",
				borderRadius: "md",
				padding: "3.5",
			})}
		>
			<Eyebrow variant="neutral" size="sm">
				{eyebrow}
			</Eyebrow>
			{children}
		</VStack>
	)
}
