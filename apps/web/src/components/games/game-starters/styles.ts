import { css } from "styled-system/css"

export const nameClass = css({
	fontSize: "sm",
	fontWeight: "medium",
	minWidth: "0",
	truncate: true,
})

export const detailClass = css({
	textStyle: "meta",
	color: "fg.subtle",
	whiteSpace: "nowrap",
})

export const emptyClass = css({ fontSize: "sm", color: "fg.subtle" })
