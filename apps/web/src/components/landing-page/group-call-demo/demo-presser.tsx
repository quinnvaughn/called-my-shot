import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"
import { DEMO_PRESSER } from "./demo-fixture"

// A groupmate's question for the viewer's presser after the demo's game.
export function DemoPresser() {
	return (
		<VStack gap="2" alignItems="stretch">
			<Eyebrow variant="neutral" size="sm">
				Post-game presser
			</Eyebrow>
			<span className={css({ textStyle: "meta", color: "fg.subtle" })}>
				{DEMO_PRESSER.from} asks you
			</span>
			<p className={css({ fontSize: "sm", lineHeight: "snug" })}>
				{DEMO_PRESSER.question}
			</p>
		</VStack>
	)
}
