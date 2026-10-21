import type { ReactNode } from "react"
import { css } from "styled-system/css"

export function SpaceColumnHeader({
	title,
	subtitle,
}: {
	title: string
	subtitle?: ReactNode
}) {
	return (
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "1",
				paddingInline: "3",
				paddingBottom: "4",
				borderBottom: "1px solid {colors.border.default}",
			})}
		>
			<h2
				className={css({
					fontFamily: "heading",
					fontSize: "lg",
					lineHeight: "tight",
					overflowWrap: "anywhere",
				})}
			>
				{title}
			</h2>
			{subtitle && (
				<div
					className={css({
						display: "flex",
						alignItems: "center",
						gap: "2",
						textStyle: "label",
						color: "fg.muted",
					})}
				>
					{subtitle}
				</div>
			)}
		</div>
	)
}
