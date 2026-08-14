import type { ReactNode } from "react"
import { css } from "styled-system/css"

type Props = {
	children: ReactNode
	variant?: "primary" | "secondary" | "neutral"
	size?: "sm" | "md"
}

const colorByVariant = {
	primary: "primary.default",
	secondary: "secondary.default",
	neutral: "fg.muted",
} as const

export function Eyebrow({
	children,
	variant = "secondary",
	size = "md",
}: Props) {
	return (
		<div
			className={css({
				fontFamily: "mono",
				fontSize: size === "sm" ? "2xs" : "xs",
				fontWeight: "medium",
				textTransform: "uppercase",
				letterSpacing: "wider",
				color: colorByVariant[variant],
			})}
		>
			{children}
		</div>
	)
}
