import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

export function StatCard({ value, label }: { value: number; label: string }) {
	return (
		<VStack
			alignItems="flex-start"
			gap="1"
			className={css({
				bg: "bg.surface",
				border: "1px solid {colors.border.default}",
				borderRadius: "xl",
				padding: "4",
			})}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "xl",
					fontWeight: "semibold",
				})}
			>
				{value}
			</span>
			<span className={css({ fontSize: "xs", color: "fg.muted" })}>
				{label}
			</span>
		</VStack>
	)
}
