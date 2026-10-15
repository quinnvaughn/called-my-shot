import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

export function StatLine({ label, value }: { label: string; value: string }) {
	return (
		<HStack justify="space-between" alignItems="baseline">
			<span
				className={css({
					textStyle: "label",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
			<span className={css({ fontWeight: "semibold" })}>{value}</span>
		</HStack>
	)
}
