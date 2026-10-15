import { css, cx } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import type { RailTone } from "#/lib/game-set-rail"
import { subtleLabelClass, TONE_COLOR } from "./rail-styles"

export function SummaryStat({
	value,
	label,
	tone = "default",
}: {
	value: string
	label: string
	tone?: RailTone
}) {
	return (
		<VStack gap="0.5" alignItems="flex-start">
			<span
				className={cx(
					css({
						fontFamily: "mono",
						fontSize: "2xl",
						fontWeight: "bold",
						lineHeight: "1",
					}),
					TONE_COLOR[tone],
				)}
			>
				{value}
			</span>
			<span className={subtleLabelClass}>{label}</span>
		</VStack>
	)
}
