import { css } from "styled-system/css"

type Props = {
	children: string
	dot?: boolean
	variant?: "primary" | "secondary"
}

export function Badge({ children, dot, variant = "secondary" }: Props) {
	return (
		<div
			className={css({
				display: "inline-flex",
				alignItems: "center",
				fontFamily: "mono",
				gap: "2",
				fontSize: "xs",
				textTransform: "uppercase",
				letterSpacing: "wider",
				color: variant === "primary" ? "primary.default" : "secondary.default",
				backgroundColor:
					variant === "primary" ? "primary.default/10" : "secondary.default/10",
				padding: "{spacing.1.5} {spacing.3}",
				borderRadius: "full",
			})}
		>
			{dot && (
				<div
					className={css({
						width: "6px",
						height: "6px",
						borderRadius: "50%",
						backgroundColor:
							variant === "primary" ? "primary.default" : "secondary.default",
					})}
				></div>
			)}
			{children}
		</div>
	)
}
