import { css } from "styled-system/css"

export const mutedClass = css({
	textStyle: "meta",
	color: "fg.subtle",
	whiteSpace: "nowrap",
})

export const numberClass = css({
	fontFamily: "mono",
	fontSize: "sm",
	fontVariantNumeric: "tabular-nums",
})

export const tileValueClass = css({
	fontFamily: "heading",
	fontSize: "lg",
	lineHeight: "1.1",
})

export const denseTileValueClass = css({
	fontFamily: "heading",
	fontSize: "sm",
	lineHeight: "1.1",
})

export const tileLabelClass = css({
	textStyle: "labelSm",
	color: "fg.subtle",
})
