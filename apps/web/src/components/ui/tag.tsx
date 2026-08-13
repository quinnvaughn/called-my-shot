import { css } from "styled-system/css"

type Props = {
	children: string
	variant?: "primary" | "neutral"
}

export function Tag({ children, variant = "neutral" }: Props) {
	return (
		<div
			className={css({
				display: "inline-flex",
				alignItems: "center",
				fontFamily: "mono",
				fontSize: "xs",
				fontWeight: "medium",
				letterSpacing: "wide",
				color: variant === "primary" ? "primary.default" : "fg.muted",
				backgroundColor: variant === "primary" ? "primary.subtle" : "bg.subtle",
				padding: "{spacing.1} {spacing.2.5}",
				borderRadius: "sm",
			})}
		>
			{children}
		</div>
	)
}
