import { css } from "styled-system/css"
import { gloatText } from "#/lib/fade-copy"

// The line the winning side of a fade sent, attributed. Shown wherever that
// fade appears: the doubter's row on the target's page, and the fader's own
// call page.
export function GloatStamp({
	username,
	message,
}: {
	username: string
	message: string
}) {
	return (
		<p
			className={css({
				fontSize: "sm",
				color: "fg.default",
				backgroundColor: "bg.subtle",
				borderLeft: "2px solid {colors.primary.default}",
				paddingBlock: "1.5",
				paddingInline: "2.5",
				borderRadius: "0 {radii.sm} {radii.sm} 0",
			})}
		>
			<b>@{username}</b>: {gloatText(message)}
		</p>
	)
}
