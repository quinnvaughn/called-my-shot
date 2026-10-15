import { css } from "styled-system/css"

type Props = {
	// "current" takes the surrounding text color, for dots inside a tinted tag.
	tone?: "secondary" | "current"
}

// Pulsing dot that marks something as in progress right now.
export function LiveDot({ tone = "secondary" }: Props) {
	return (
		<span
			className={css({
				width: "1.5",
				height: "1.5",
				borderRadius: "full",
				bg: tone === "current" ? "currentColor" : "secondary.default",
				animation: "pulse 1.6s ease-in-out infinite",
			})}
		/>
	)
}
