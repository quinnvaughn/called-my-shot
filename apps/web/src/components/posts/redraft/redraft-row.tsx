import type { ReactNode } from "react"
import { css } from "styled-system/css"
import type { RushmorePalette } from "#/lib/rushmore-palette"
import { PlayerPortrait, type PortraitPlayer } from "../player-portrait"
import { MoveBadge } from "./move-badge"

type Props = {
	slot: number
	palette: RushmorePalette
	player: PortraitPlayer
	// The team that held this pick: its logo now, and what it was called that
	// year for the logo's label.
	teamLogoUrl: string | null
	teamName: string | null
	// Null for a player who came in undrafted.
	original: number | null
	// Off where the row is the real pick, which has nowhere to have moved.
	showMove?: boolean
	// Draw the player's face. Off for the rows past the first few on a feed
	// card, which stay one line each.
	showFace?: boolean
	// Beside the badge, like the share of redrafts with this player here.
	sub?: ReactNode
	size?: "lg" | "sm"
}

// One slot on a redraft: the pick number, the logo of the team that held it,
// the player taken there now, and how far they moved from the real draft.
export function RedraftRow({
	slot,
	palette,
	player,
	teamLogoUrl,
	teamName,
	original,
	showMove = true,
	showFace = true,
	sub,
	size = "lg",
}: Props) {
	const large = size === "lg"
	const logo = large ? "28px" : "20px"
	return (
		<li
			className={css({
				display: "flex",
				alignItems: "center",
				gap: large ? "3" : "2",
				borderRadius: "lg",
				minWidth: "0",
			})}
			style={{
				background: palette.faceBacking,
				padding: large ? "8px 12px" : "4px 10px",
			}}
		>
			<span
				className={css({
					flexShrink: 0,
					fontFamily: "heading",
					textAlign: "right",
				})}
				style={{
					width: large ? "28px" : "22px",
					fontSize: large ? "18px" : "14px",
				}}
			>
				{slot}
			</span>
			<span
				className={css({ display: "flex", flexShrink: 0 })}
				style={{ width: logo, height: logo }}
			>
				{teamLogoUrl && (
					<img
						src={teamLogoUrl}
						alt={teamName ?? ""}
						title={teamName ?? undefined}
						loading="lazy"
						decoding="async"
						className={css({
							width: "full",
							height: "full",
							objectFit: "contain",
						})}
					/>
				)}
			</span>
			{showFace && (
				<PlayerPortrait
					player={player}
					palette={palette}
					size={large ? 40 : 28}
				/>
			)}
			<span
				className={css({
					flex: 1,
					minWidth: 0,
					fontWeight: "semibold",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				})}
				style={{ fontSize: large ? "16px" : "13px" }}
			>
				{player.name}
			</span>
			{sub}
			{showMove && <MoveBadge slot={slot} original={original} />}
		</li>
	)
}
