import { css } from "styled-system/css"

type Props = {
	value: number
	max: number
}

// Thin bar filled to value / max, rounded to the nearest percent. A max of 0
// draws it empty.
export function ProgressBar({ value, max }: Props) {
	const pct = max === 0 ? 0 : Math.round((value / max) * 100)

	return (
		<div
			className={css({
				height: "1.5",
				borderRadius: "full",
				bg: "bg.subtle",
				border: "1px solid {colors.border.default}",
				overflow: "hidden",
			})}
		>
			<div
				className={css({
					height: "full",
					borderRadius: "full",
					bg: "secondary.default",
				})}
				style={{ width: `${pct}%` }}
			/>
		</div>
	)
}
