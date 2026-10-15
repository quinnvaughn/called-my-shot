import { useState } from "react"
import { css, cva, cx } from "styled-system/css"
import { imageFraming } from "#/lib/image-framing"
import { initials } from "#/lib/initials"
import { coverImage } from "./avatar"

const headshotStyle = cva({
	base: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
		overflow: "hidden",
		borderRadius: "full",
		bg: "bg.subtle",
		border: "1px solid {colors.border.default}",
		color: "fg.muted",
		fontFamily: "mono",
		fontWeight: "medium",
	},
	variants: {
		size: {
			sm: { width: "8", height: "8", fontSize: "xs" },
			md: { width: "10", height: "10", fontSize: "xs" },
			lg: { width: "12", height: "12", fontSize: "sm" },
		},
	},
	defaultVariants: { size: "sm" },
})

// League headshots are framed head-and-shoulders, some portrait (MLB), so
// cropping to a circle keeps the top rather than the chest.
const headshotImage = css({ objectPosition: "top" })

type Props = {
	name: string
	// players.headshotUrl. Null or missing, or failing to load, falls back to
	// the player's initials.
	src?: string | null
	size?: "sm" | "md" | "lg"
}

export function PlayerHeadshot({ name, src, size }: Props) {
	const [failedSrc, setFailedSrc] = useState<string | null>(null)
	const showImage = !!src && src !== failedSrc

	return (
		<div className={headshotStyle({ size })}>
			{showImage ? (
				// Empty alt: the player's name is always rendered beside it.
				<img
					src={src}
					alt=""
					className={cx(coverImage, headshotImage)}
					loading="lazy"
					decoding="async"
					onError={() => setFailedSrc(src)}
					style={imageFraming(src)}
				/>
			) : (
				initials(name)
			)}
		</div>
	)
}
