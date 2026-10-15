import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

export function LegalSection({
	heading,
	children,
}: {
	heading: string
	children: ReactNode
}) {
	return (
		<VStack as="section" gap="3" alignItems="stretch">
			<h2
				className={css({
					fontFamily: "heading",
					fontSize: "md",
					textTransform: "uppercase",
					letterSpacing: "wide",
					color: "fg.default",
				})}
			>
				{heading}
			</h2>
			{children}
		</VStack>
	)
}
