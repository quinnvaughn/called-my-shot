import { css } from "styled-system/css"

// One bar of the guess distribution: how many days were solved in `label`
// guesses, the bar scaled to the most common count.
export function SeasonDistributionRow({
	label,
	count,
	max,
	highlight,
}: {
	label: string
	count: number
	max: number
	highlight: boolean
}) {
	const width = max > 0 ? Math.max((count / max) * 100, count > 0 ? 6 : 0) : 0
	return (
		<div
			className={css({
				display: "grid",
				gridTemplateColumns: "1rem 1fr 2rem",
				alignItems: "center",
				gap: "2",
				textStyle: "meta",
				color: highlight ? "fg.default" : "fg.muted",
			})}
		>
			<span>{label}</span>
			<span className={css({ display: "flex", height: "3.5" })}>
				<span
					style={{ width: `${width}%` }}
					className={css({
						display: "block",
						height: "full",
						borderRadius: "0 4px 4px 0",
						bg: highlight ? "success.default" : "border.emphasized",
					})}
				/>
			</span>
			<span className={css({ textAlign: "right" })}>{count}</span>
		</div>
	)
}
