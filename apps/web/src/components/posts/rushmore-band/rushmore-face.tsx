import type { ReactNode } from "react"
import { FiPlus } from "react-icons/fi"
import { css } from "styled-system/css"
import type { RushmorePalette } from "#/lib/rushmore-palette"
import { PlayerPortrait, type PortraitPlayer } from "../player-portrait"

// How far each of the four faces stands above the first, as a share of the
// face's size, so they stagger along the ridge like the share image instead
// of sitting in a flat row.
const RAISE = [0, 0.16, 0.07, 0.2]

type Props = {
	player: PortraitPlayer | null
	index: number
	palette: RushmorePalette
	size: "lg" | "sm"
	// A line under the name, like how many Rushmores have this player.
	sub?: ReactNode
	// Pinned to the face's corner, like the composer's remove button.
	action?: ReactNode
}

// One of the four places on a Rushmore: a player's face with their name
// under it, or an empty ring waiting for a pick.
export function RushmoreFace({
	player,
	index,
	palette,
	size,
	sub,
	action,
}: Props) {
	const ring =
		size === "lg" ? "clamp(56px, 16vw, 96px)" : "clamp(34px, 9vw, 48px)"
	return (
		<div
			className={css({
				position: "relative",
				zIndex: 1,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "2",
				minWidth: "0",
			})}
			style={{
				transform: `translateY(calc(${ring} * -${RAISE[index] ?? 0}))`,
			}}
		>
			<span className={css({ position: "relative", display: "flex" })}>
				{player ? (
					<PlayerPortrait player={player} palette={palette} size={ring} />
				) : (
					<span
						aria-hidden
						className={css({
							display: "grid",
							placeItems: "center",
							aspectRatio: "1",
							borderRadius: "full",
							opacity: 0.6,
						})}
						style={{ width: ring, border: `2px dashed ${palette.foreground}` }}
					>
						<FiPlus size={18} />
					</span>
				)}
				{action && (
					<span
						className={css({ position: "absolute", top: "-1", right: "-1" })}
					>
						{action}
					</span>
				)}
			</span>
			{size === "lg" && (
				<span
					className={css({
						fontSize: "sm",
						fontWeight: "semibold",
						lineHeight: "1.2",
						textAlign: "center",
						overflowWrap: "anywhere",
					})}
					style={{ opacity: player ? 1 : 0.6 }}
				>
					{player ? player.name : "Open"}
				</span>
			)}
			{size === "lg" && sub && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						textAlign: "center",
						opacity: 0.85,
					})}
				>
					{sub}
				</span>
			)}
		</div>
	)
}
