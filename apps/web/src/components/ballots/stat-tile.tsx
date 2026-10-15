import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

export function StatTile({
	value,
	label,
}: {
	value: number | string
	label: string
}) {
	return (
		<VStack gap="0.5" alignItems="flex-start">
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "lg",
					fontWeight: "bold",
				})}
			>
				{value}
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					letterSpacing: "wide",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
		</VStack>
	)
}
