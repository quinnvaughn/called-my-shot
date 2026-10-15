import { css } from "styled-system/css"

// The unread count, as on the sidebar's Notifications link and, below md, on
// the menu button that opens it.
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
