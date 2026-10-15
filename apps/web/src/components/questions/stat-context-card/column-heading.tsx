import type { ReactNode } from "react"
import { HStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"

// A column's name, with the player's headshot or the team's logo beside it.
export function ColumnHeading({
	label,
	image,
}: {
	label: string
	image: ReactNode
}) {
	return (
		<HStack gap="2" alignItems="center" minWidth="0">
			{image}
			<Eyebrow size="sm">{label}</Eyebrow>
		</HStack>
	)
}
