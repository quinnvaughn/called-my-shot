import { css, cx } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { LiveDot } from "#/components/ui/live-dot"
import { labelBase } from "./rail-styles"

export function LiveTag() {
	return (
		<HStack gap="1.5" alignItems="center">
			<LiveDot />
			<span
				className={cx(
					labelBase,
					css({ color: "fg.default", fontWeight: "bold" }),
				)}
			>
				Live
			</span>
		</HStack>
	)
}
