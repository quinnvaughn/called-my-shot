import { type HTMLAttributes, useState } from "react"
import { FaCrown } from "react-icons/fa6"
import { css, cva, cx } from "styled-system/css"

export const avatarStyle = cva({
	base: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
		overflow: "hidden",
		borderRadius: "full",
		bg: "bg.subtle",
		border: "1px solid {colors.border.default}",
		color: "fg.default",
		fontFamily: "mono",
		fontWeight: "medium",
	},
	variants: {
		size: {
			xs: { width: "9", height: "9", fontSize: "xs" },
			sm: { width: "9", height: "9", fontSize: "xs" },
			md: { width: "9", height: "9", fontSize: "xs" },
			lg: { width: "16", height: "16", fontSize: "xl" },
		},
	},
	defaultVariants: { size: "md" },
})

// Shared by every uploaded image that fills its frame: avatars, group logos.
export const coverImage = css({
	width: "full",
	height: "full",
	objectFit: "cover",
})

type AvatarProps = HTMLAttributes<HTMLDivElement> & {
	name: string
	// The uploaded picture. Null or missing, or failing to load, falls back to
	// the first letter of the name.
	src?: string | null
	size?: "xs" | "sm" | "md" | "lg"
	// A crown tilted over the top-right edge, for the reigning Player of the
	// Week. The string is what it says to a screen reader and on hover:
	// "Player of the Week, Oct 6 to 12".
	crown?: string | null
}

// Blue rather than primary orange: it says who won, it isn't something to
// tap. Outside the avatar's clipped circle, so it sits over the edge instead
// of being cut off by it.
const crownStyle = css({
	position: "absolute",
	top: "-1",
	right: "-0.5",
	display: "flex",
	color: "secondary.default",
	transform: "rotate(30deg)",
	filter: "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6))",
	pointerEvents: "none",
})

export function Avatar({
	name,
	src,
	size,
	crown,
	className,
	...props
}: AvatarProps) {
	// Remembers which URL failed rather than a plain flag, so a new upload
	// gets its own chance to load.
	const [failedSrc, setFailedSrc] = useState<string | null>(null)
	const showImage = !!src && src !== failedSrc

	const avatar = (
		<div className={cx(avatarStyle({ size }), className)} {...props}>
			{showImage ? (
				// Empty alt: the name is always rendered right beside an avatar, so
				// describing the picture would only make a screen reader say it twice.
				<img
					src={src}
					alt=""
					className={coverImage}
					loading="lazy"
					decoding="async"
					onError={() => setFailedSrc(src)}
				/>
			) : (
				name.charAt(0).toUpperCase()
			)}
		</div>
	)
	if (!crown) return avatar

	return (
		<div
			className={css({ position: "relative", display: "flex", flexShrink: 0 })}
		>
			{avatar}
			<span role="img" aria-label={crown} title={crown} className={crownStyle}>
				<FaCrown size={size === "lg" ? 22 : 14} aria-hidden />
			</span>
		</div>
	)
}
