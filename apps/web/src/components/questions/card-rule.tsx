import { css } from "styled-system/css"

// The single divider between a card's "what is this question" section and
// whatever's specific to it below - plain and thin. Spacing around it comes
// from the containing VStack's own gap, not a margin on this element.
export function CardRule() {
	return (
		<hr
			className={css({
				border: "none",
				borderTop: "1px solid {colors.border.default}",
				width: "full",
			})}
		/>
	)
}
