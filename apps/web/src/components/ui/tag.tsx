import { css } from "styled-system/css"

type Props = {
	children: string
	variant?: "primary" | "secondary" | "neutral" | "success" | "danger"
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
				// Spelled out as nested ternaries rather than a variant->token
				// lookup map: Panda extracts CSS statically, and a map indexed
				// by a prop is opaque to it, so the classes for whichever
				// variants no other file happens to use would never be emitted.
				//
				// success.default/success.subtle is for a tag that reports an
				// outcome, like a winning call; danger is its losing
				// counterpart. A tag naming a lifecycle state the viewer didn't earn
				// (resolved, final, a permission that happens to be on) is
				// neutral; secondary is for a state worth picking out of a column
				// of neutral chrome, where neutral would erase the distinction.
				color:
					variant === "primary"
						? "primary.default"
						: variant === "secondary"
							? "secondary.default"
							: variant === "success"
								? "success.default"
								: variant === "danger"
									? "danger.default"
									: "fg.default",
				backgroundColor:
					variant === "primary"
						? "primary.subtle"
						: variant === "secondary"
							? "secondary.subtle"
							: variant === "success"
								? "success.subtle"
								: variant === "danger"
									? "danger.subtle"
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
