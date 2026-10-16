import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"

// A groupmate's question for the viewer's presser after the demo's game.
export function DemoPresser({
	from,
	question,
}: {
	from: string
	question: string
}) {
	return (
		<VStack gap="2" alignItems="stretch">
			<Eyebrow variant="neutral" size="sm">
				Post-game presser
			</Eyebrow>
			<span className={css({ textStyle: "meta", color: "fg.subtle" })}>
				{from} asks you
			</span>
			<p className={css({ fontSize: "sm", lineHeight: "snug" })}>{question}</p>
		</VStack>
	)
}
