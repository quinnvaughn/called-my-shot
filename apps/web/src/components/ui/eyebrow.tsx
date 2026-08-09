import { css } from "styled-system/css"

type Props = {
	children: string
	variant?: "primary" | "secondary"
}

export function Eyebrow({ children, variant = "secondary" }: Props) {
	return (
		<div
			className={css({
				fontFamily: "mono",
				fontSize: "xs",
				textTransform: "uppercase",
				letterSpacing: "wider",
				color: variant === "primary" ? "primary.default" : "secondary.default",
			})}
		>
			{children}
		</div>
	)
}
