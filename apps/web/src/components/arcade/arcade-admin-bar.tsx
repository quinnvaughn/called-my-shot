import type { ReactNode } from "react"
import { css } from "styled-system/css"

// An admin's testing controls above an arcade game, boxed in dashes so they
// never read as part of the game.
export function ArcadeAdminBar({
	label,
	children,
}: {
	label: string
	children: ReactNode
}) {
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "3",
				flexWrap: "wrap",
				marginBottom: "4",
				padding: "{spacing.2} {spacing.3}",
				border: "1px dashed {colors.border.default}",
				borderRadius: "lg",
			})}
		>
			<span className={css({ textStyle: "label", color: "fg.muted" })}>
				{label}
			</span>
			<div className={css({ display: "flex", gap: "2" })}>{children}</div>
		</div>
	)
}
