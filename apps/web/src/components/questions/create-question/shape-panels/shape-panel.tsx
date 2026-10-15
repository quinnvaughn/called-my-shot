import type { ReactNode } from "react"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Section } from "../section"

// The card every shape panel fills in. Each one is required - a question has
// to have a subject, so there's no shape whose own panel is optional.
export function ShapePanel({
	label,
	children,
}: {
	label: string
	children: ReactNode
}) {
	return (
		<Section label={label} required>
			<Card>
				<Card.Body>
					<VStack gap="3.5" alignItems="stretch">
						{children}
					</VStack>
				</Card.Body>
			</Card>
		</Section>
	)
}
