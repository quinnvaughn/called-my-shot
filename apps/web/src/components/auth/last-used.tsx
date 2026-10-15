import { css } from "styled-system/css"
import { Tag } from "#/components/ui/tag"

// Pins a small "Last used" tag to the top corner of whichever way in this
// browser used last, so someone with both doesn't have to remember which.
export function LastUsed({
	show,
	children,
}: {
	show: boolean
	children: React.ReactNode
}) {
	if (!show) return children
	return (
		<div className={css({ position: "relative" })}>
			{children}
			<span
				className={css({
					position: "absolute",
					top: "-2",
					right: "3",
					bg: "bg.default",
					pointerEvents: "none",
				})}
			>
				<Tag size="sm" variant="primary">
					Last used
				</Tag>
			</span>
		</div>
	)
}
