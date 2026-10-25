import { useState } from "react"
import { css } from "styled-system/css"
import { initials } from "#/lib/initials"
import type { RushmorePalette } from "#/lib/rushmore-palette"

export type PortraitPlayer = {
	name: string
	portraitUrl?: string | null
	headshotUrl?: string | null
}

type Props = {
	player: PortraitPlayer
	palette: RushmorePalette
	// The ring's outer width in px; the ring itself scales with it.
	size: number | string
}

// One player's face in a ring, the way every Rushmore shows it: their
// portrait (a square head-and-shoulders crop, see apps/api/src/lib/portraits),
// the league headshot when there's no portrait yet, or their initials.
export function PlayerPortrait({ player, palette, size }: Props) {
	const [failed, setFailed] = useState<string[]>([])
	const src = [player.portraitUrl, player.headshotUrl].find(
		(url): url is string => !!url && !failed.includes(url),
	)
	return (
		<span
			className={css({
				position: "relative",
				display: "grid",
				placeItems: "center",
				flexShrink: 0,
				aspectRatio: "1",
				borderRadius: "full",
				overflow: "hidden",
				fontFamily: "heading",
			})}
			style={{
				width: size,
				background: palette.faceBacking,
				color: palette.foreground,
				boxShadow: `0 0 0 3px ${palette.foreground}`,
			}}
		>
			{src ? (
				// Empty alt: the player's name is always printed with the face.
				<img
					src={src}
					alt=""
					loading="lazy"
					decoding="async"
					onError={() => setFailed((prev) => [...prev, src])}
					className={css({
						width: "full",
						height: "full",
						objectFit: "cover",
						objectPosition: "top",
					})}
				/>
			) : (
				<span aria-hidden className={css({ fontSize: "lg" })}>
					{initials(player.name)}
				</span>
			)}
		</span>
	)
}
