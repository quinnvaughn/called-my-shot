import { css } from "styled-system/css"

type Props = {
	children: string
	variant?: "primary" | "neutral" | "success"
	size?: "sm" | "md" | "lg"
}

// "md" reproduces the original (pre-size-variant) look exactly - every
// existing call site omits `size` and must keep rendering unchanged.
export function Tag({ children, variant = "neutral", size = "md" }: Props) {
	return (
		<div
			className={css({
				display: "inline-flex",
				alignItems: "center",
				fontFamily: "mono",
				fontWeight: "bold",
				letterSpacing: "wide",
				textTransform: "uppercase",
				// success.default/success.subtle - the same pairing ResultBadge
				// uses for a winning call.
				color:
					variant === "primary"
						? "primary.default"
						: variant === "success"
							? "success.default"
							: "fg.default",
				backgroundColor:
					variant === "primary"
						? "primary.subtle"
						: variant === "success"
							? "success.subtle"
							: "border.default",
				fontSize: size === "lg" ? "sm" : size === "md" ? "xs" : "2xs",
				padding:
					size === "lg"
						? "{spacing.1.5} {spacing.3}"
						: size === "md"
							? "{spacing.1} {spacing.2.5}"
							: "{spacing.0.5} {spacing.2}",
				borderRadius: "sm",
			})}
		>
			{children}
		</div>
	)
}
