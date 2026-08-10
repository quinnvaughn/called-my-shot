import type { HTMLAttributes } from "react"
import { cva, cx } from "styled-system/css"

const avatarStyle = cva({
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
			sm: { width: "6", height: "6", fontSize: "2xs" },
			md: { width: "8", height: "8", fontSize: "xs" },
		},
	},
	defaultVariants: { size: "md" },
})

type AvatarProps = HTMLAttributes<HTMLDivElement> & {
	name: string
	size?: "sm" | "md"
}

export function Avatar({ name, size, className, ...props }: AvatarProps) {
	return (
		<div className={cx(avatarStyle({ size }), className)} {...props}>
			{name.charAt(0).toUpperCase()}
		</div>
	)
}
