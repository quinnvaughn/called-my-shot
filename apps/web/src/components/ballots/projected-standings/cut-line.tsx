import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

export function CutLine({ label }: { label: string }) {
	return (
		<HStack
			gap="2"
			alignItems="center"
			paddingInline="3"
			paddingBlock="1"
			className={css({ borderBottom: "1px dashed {colors.border.emphasized}" })}
		>
			<span
				className={css({
					textStyle: "labelSm",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
		</HStack>
	)
}
