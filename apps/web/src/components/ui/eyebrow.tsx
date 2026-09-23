import type { ReactNode } from "react"
import { css } from "styled-system/css"

type Props = {
	children: ReactNode
	variant?: "primary" | "secondary" | "neutral"
	size?: "sm" | "md"
}

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
				// Spelled out rather than looked up in a variant->token map: Panda
				// extracts CSS statically, and a map indexed by a prop is opaque to
				// it, so the class for any token no other file happens to use with
				// this same property would never be emitted.
				color:
					variant === "primary"
						? "primary.default"
						: variant === "secondary"
							? "secondary.default"
							: "fg.muted",
			})}
		>
			{children}
		</div>
	)
}
