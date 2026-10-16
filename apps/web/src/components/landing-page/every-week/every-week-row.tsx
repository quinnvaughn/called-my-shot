import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

// A label and who holds it, in one of the week panels. `miss` colors the
// holder as a loss, for the recap's worst miss.
export function EveryWeekRow({
	label,
	value,
	miss = false,
}: {
	label: string
	value: string
	miss?: boolean
}) {
	return (
		<HStack
			justify="space-between"
			gap="3"
			className={css({
				fontSize: "sm",
				paddingBlock: "1",
				borderTop: "1px solid {colors.border.default}",
				_first: { borderTop: "none" },
			})}
		>
			<span className={css({ color: "fg.muted" })}>{label}</span>
			<span
				className={css({
					textStyle: "metaLg",
					color: miss ? "danger.default" : "fg.default",
					whiteSpace: "nowrap",
				})}
			>
				{value}
			</span>
		</HStack>
	)
}
