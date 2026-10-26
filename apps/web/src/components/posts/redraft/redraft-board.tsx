import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { type RushmorePalette, rushmorePalette } from "#/lib/rushmore-palette"

type Props = {
	// The class's color (RedraftPrompt.color).
	color: string | null | undefined
	// Above the picks: the class, who made it. Text inherits the board's
	// foreground.
	header?: ReactNode
	// The rows, slot 1 first. Each gets the palette to draw itself in.
	rows: (palette: RushmorePalette) => ReactNode
	// Under the picks: the post page puts its address here so a screenshot
	// still says where it came from.
	footer?: ReactNode
	size?: "lg" | "sm"
}

// A redraft drawn the way its share image is: the class's color behind a
// list of picks, each on a shade of it. The post page, the class's page,
// feed cards and the composer's preview all show a redraft this way.
export function RedraftBoard({
	color,
	header,
	rows,
	footer,
	size = "lg",
}: Props) {
	const palette = rushmorePalette(color)
	const large = size === "lg"
	return (
		<div
			className={css({
				position: "relative",
				overflow: "hidden",
				borderRadius: large ? "2xl" : "xl",
			})}
			style={{ background: palette.background, color: palette.foreground }}
		>
			{header && (
				<div
					className={css({
						position: "relative",
						// Over the rows, so a menu opened from the header drops down
						// across them.
						zIndex: 2,
					})}
					style={{ padding: large ? "24px 24px 0" : "12px 16px 0" }}
				>
					{header}
				</div>
			)}
			<ol
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "1.5",
				})}
				style={{ padding: large ? "20px 16px" : "12px" }}
			>
				{rows(palette)}
			</ol>
			{footer && (
				<div
					className={css({ padding: "{spacing.2} {spacing.4} {spacing.3}" })}
					style={{ background: palette.faceBacking }}
				>
					{footer}
				</div>
			)}
		</div>
	)
}
