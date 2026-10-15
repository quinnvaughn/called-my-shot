import { type HTMLAttributes, useState } from "react"
import { cva, cx } from "styled-system/css"
import { coverImage } from "./avatar"

// Square with rounded corners where an avatar is a circle, so a group never
// reads as a person at a glance.
const groupLogoStyle = cva({
	base: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
		overflow: "hidden",
		borderRadius: "md",
		bg: "bg.subtle",
		border: "1px solid {colors.border.default}",
		color: "fg.default",
		fontFamily: "heading",
	},
	variants: {
		size: {
			xs: { width: "6", height: "6", fontSize: "xs" },
			sm: { width: "8", height: "8", fontSize: "sm" },
			md: { width: "10", height: "10", fontSize: "md" },
			lg: { width: "16", height: "16", fontSize: "2xl" },
		},
	},
	defaultVariants: { size: "md" },
})

type Props = HTMLAttributes<HTMLDivElement> & {
	name: string
	// Null or missing, or failing to load, falls back to the group's initial.
	src?: string | null
	size?: "xs" | "sm" | "md" | "lg"
}

export function GroupLogo({ name, src, size, className, ...props }: Props) {
	const [failedSrc, setFailedSrc] = useState<string | null>(null)
	const showImage = !!src && src !== failedSrc

	return (
		<div className={cx(groupLogoStyle({ size }), className)} {...props}>
			{showImage ? (
				// Empty alt: the group's name is always rendered beside its logo.
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
}
