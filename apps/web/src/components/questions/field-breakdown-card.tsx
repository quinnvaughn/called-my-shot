import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"

// The one card shell both breakdown views share - numeric's own distribution
// chart and every other type's option-by-option list are two different
// bodies, but "how the field called it" always renders as the same card,
// always positioned after the viewer's own status card (see $questionId.tsx).
export function FieldBreakdownCard({ children }: { children: ReactNode }) {
	return (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<h2
						className={css({
							textStyle: "sectionHeading",
							color: "fg.muted",
						})}
					>
						How the field called it
					</h2>
					{children}
				</VStack>
			</Card.Body>
		</Card>
	)
}
