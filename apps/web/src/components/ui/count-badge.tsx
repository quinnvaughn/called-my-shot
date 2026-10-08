import { css } from "styled-system/css"

// A small count pill that sits inline after a label, e.g. a tab's
// "Community" followed by how many questions are behind it. Secondary (blue)
// because it informs rather than invites a click of its own.
export function CountBadge({ count }: { count: number }) {
	return (
		<span
			className={css({
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				minWidth: "5",
				height: "5",
				paddingInline: "1.5",
				marginInlineStart: "1.5",
				borderRadius: "full",
				fontFamily: "mono",
				fontSize: "2xs",
				fontWeight: "bold",
				lineHeight: "1",
				letterSpacing: "normal",
				color: "secondary.contrast",
				backgroundColor: "secondary.default",
			})}
		>
			{count}
		</span>
	)
}
