import { css } from "styled-system/css"

export const kickerClass = css({
	textStyle: "label",
	color: "fg.muted",
})

export const mathDefault = css({
	textStyle: "metaLg",
	color: "fg.default",
})
export const mathDownside = css({
	textStyle: "metaLg",
	fontWeight: "bold",
	color: "fg.default",
})
export const mathUpside = css({
	textStyle: "metaLg",
	fontWeight: "bold",
	color: "success.default",
})
export const mathLose = css({
	textStyle: "metaLg",
	fontWeight: "bold",
	color: "danger.default",
})

export const heroWinClass = css({
	fontFamily: "mono",
	fontSize: "2xl",
	fontWeight: "bold",
	lineHeight: "1",
	color: "success.default",
})

export const heroLoseClass = css({
	fontFamily: "mono",
	fontSize: "2xl",
	fontWeight: "bold",
	lineHeight: "1",
	color: "danger.default",
})
