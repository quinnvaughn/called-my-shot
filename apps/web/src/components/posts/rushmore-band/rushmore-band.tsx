import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { rushmorePalette } from "#/lib/rushmore-palette"
import type { PortraitPlayer } from "../player-portrait"
import { RushmoreFace } from "./rushmore-face"

export type RushmoreSlot = {
	key: string
	player: PortraitPlayer | null
	sub?: ReactNode
	action?: ReactNode
}

type Props = {
	// The prompt's color: its team's, or its own (RushmorePrompt.color).
	color: string | null | undefined
	// Above the faces: the prompt, who made it, anything else the page puts
	// on the color. Text inherits the band's foreground.
	header?: ReactNode
	// Exactly four, left to right.
	slots: RushmoreSlot[]
	// Under the faces, on the ridge: the post page puts its address here so a
	// screenshot still says where it came from.
	footer?: ReactNode
	size?: "lg" | "sm"
}

// A Rushmore drawn the way its share image is: the prompt's color, a
// jagged ridge in a darker shade across the bottom, and the four faces
// standing along it. The post page, the prompt page, feed cards and the
// composer all show a Rushmore this way.
export function RushmoreBand({
	color,
	header,
	slots,
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
						// Above the faces (zIndex 1), so a menu opened from the
						// header drops down over them.
						zIndex: 2,
						padding: large
							? "{spacing.6} {spacing.6} 0"
							: "{spacing.3} {spacing.4} 0",
					})}
				>
					{header}
				</div>
			)}
			<div
				className={css({
					position: "relative",
					display: "grid",
					gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
					alignItems: "end",
					gap: "1.5",
				})}
				style={{
					padding: large ? "36px 16px 22px" : "18px 12px 10px",
				}}
			>
				<div
					aria-hidden
					className={css({
						position: "absolute",
						left: "0",
						right: "0",
						bottom: "0",
						height: "68%",
						clipPath:
							"polygon(0 100%, 0 52%, 7% 40%, 14% 47%, 22% 20%, 31% 30%, 40% 6%, 49% 22%, 58% 2%, 67% 24%, 76% 10%, 85% 30%, 93% 18%, 100% 32%, 100% 100%)",
					})}
					style={{ background: palette.ridge }}
				/>
				{slots.map((slot, index) => (
					<RushmoreFace
						key={slot.key}
						index={index}
						player={slot.player}
						palette={palette}
						size={size}
						sub={slot.sub}
						action={slot.action}
					/>
				))}
			</div>
			{footer && (
				<div
					className={css({
						position: "relative",
						padding: "{spacing.2} {spacing.4} {spacing.3}",
					})}
					style={{ background: palette.ridge }}
				>
					{footer}
				</div>
			)}
		</div>
	)
}
