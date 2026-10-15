import { css } from "styled-system/css"

export function WeekSquare({
	filled,
	running,
	label,
}: {
	filled: boolean
	running: boolean
	label: string
}) {
	return (
		<div
			title={label}
			role="img"
			aria-label={label}
			className={css({
				width: "2.5",
				height: "2.5",
				borderRadius: "xs",
				border:
					filled || running
						? "1px solid {colors.secondary.default}"
						: "1px solid {colors.fg.muted}",
				bg: filled ? "secondary.default" : "transparent",
			})}
		/>
	)
}
