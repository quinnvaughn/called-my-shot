import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

// One number on a person's card.
export function UserCardStat({
	label,
	value,
}: {
	label: string
	value: string
}) {
	return (
		<VStack gap="0.5" alignItems="flex-start" flex="1" minWidth="0">
			<span className={css({ textStyle: "label", color: "fg.muted" })}>
				{label}
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "lg",
					fontWeight: "bold",
				})}
			>
				{value}
			</span>
		</VStack>
	)
}
