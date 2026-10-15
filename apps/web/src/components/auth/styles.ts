import { css } from "styled-system/css"

export const subtleLinkClass = css({
	textStyle: "metaSm",
	color: "fg.subtle",
	textAlign: "center",
	textDecoration: "underline",
	cursor: "pointer",
	_hover: { color: "fg.default" },
})
