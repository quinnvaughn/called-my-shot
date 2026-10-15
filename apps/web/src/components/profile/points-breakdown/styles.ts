import { css } from "styled-system/css"

// Holds a row's chevron, or the matching gap on a nested row, inside the
// label column, so every row's bar track starts and ends at the same x and
// the zero lines stack.
export const leadSlot = css({
	display: "flex",
	justifyContent: "center",
	width: "4",
	flexShrink: "0",
	color: "fg.muted",
})
