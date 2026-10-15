import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

export function OrDivider() {
	const rule = css({ flex: "1", height: "1px", bg: "border.default" })
	return (
		<HStack gap="3" alignItems="center">
			<span className={rule} />
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					color: "fg.subtle",
					textTransform: "uppercase",
				})}
			>
				or
			</span>
			<span className={rule} />
		</HStack>
	)
}
