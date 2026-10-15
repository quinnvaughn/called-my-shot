import { css } from "styled-system/css"

// The unread count on the top bar's notifications bell.
export const unreadBadge = css({
	bg: "primary.default",
	color: "bg.canvas",
	textStyle: "meta",
	fontWeight: "bold",
	borderRadius: "full",
	paddingInline: "1.5",
	minWidth: "5",
	textAlign: "center",
	lineHeight: "1.6",
})

export function unreadLabel(count: number): string {
	return count > 99 ? "99+" : String(count)
}
