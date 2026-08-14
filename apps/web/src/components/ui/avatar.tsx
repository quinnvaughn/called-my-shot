import type { HTMLAttributes } from "react"
import { cva, cx } from "styled-system/css"

export const avatarStyle = cva({
	base: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
		borderRadius: "full",
		bg: "bg.subtle",
		border: "1px solid",
		borderColor: "border.default",
		color: "fg.default",
		fontFamily: "mono",
		fontWeight: "medium",
	},
	variants: {
		size: {
			xs: { width: "6", height: "6", fontSize: "3xs" },
			sm: { width: "7", height: "7", fontSize: "xs" },
			md: { width: "8", height: "8", fontSize: "xs" },
			lg: { width: "16", height: "16", fontSize: "xl" },
		},
	},
	defaultVariants: { size: "md" },
})

type AvatarProps = HTMLAttributes<HTMLDivElement> & {
	name: string
	size?: "xs" | "sm" | "md" | "lg"
}

export function Avatar({ name, size, className, ...props }: AvatarProps) {
	return (
		<div className={cx(avatarStyle({ size }), className)} {...props}>
			{name.charAt(0).toUpperCase()}
		</div>
	)
}
