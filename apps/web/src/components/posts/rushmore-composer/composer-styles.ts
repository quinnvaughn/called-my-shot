import { css } from "styled-system/css"

// The rows the prompt chooser offers, in one bordered list.
export const choiceList = css({
	display: "flex",
	flexDirection: "column",
	borderRadius: "lg",
	border: "1px solid {colors.border.default}",
	bg: "bg.surface",
	overflow: "hidden",
})

// One row in a choiceList: a prompt to answer, or starting a new one.
export const choiceRow = css({
	display: "flex",
	alignItems: "center",
	gap: "3",
	width: "full",
	padding: "{spacing.2.5} {spacing.3}",
	textAlign: "left",
	cursor: "pointer",
	_hover: { bg: "bg.subtle" },
	"&:not(:last-child)": {
		borderBottom: "1px solid {colors.border.default}",
	},
})

// The small label over each of the chooser's lists.
export const listLabel = css({
	textStyle: "label",
	color: "fg.subtle",
})

// The numbered heading over each step.
export const stepHeading = css({
	textStyle: "sectionHeading",
	color: "fg.muted",
})
