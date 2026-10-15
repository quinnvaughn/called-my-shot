import { css } from "styled-system/css"

// One row style for every link in the sidebar, whichever section it sits in,
// so the lists read as one column.
export const sidebarRow = css({
	display: "flex",
	alignItems: "center",
	gap: "3",
	width: "full",
	padding: "{spacing.2} {spacing.3}",
	borderRadius: "lg",
	fontSize: "sm",
	fontWeight: "medium",
	color: "fg.subtle",
	textAlign: "left",
	cursor: "pointer",
	_hover: { bg: "fg.default/10", color: "fg.default" },
})

export const sidebarRowActive = css({
	bg: "bg.subtle",
	color: "fg.default",
	fontWeight: "semibold",
})

// The box an icon, league badge or group logo sits in, so every row's label
// starts at the same x.
export const sidebarLeading = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "6",
	height: "6",
	flexShrink: 0,
})
