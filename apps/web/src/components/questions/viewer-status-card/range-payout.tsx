import { css } from "styled-system/css"

export function RangePayout({
	winLow,
	winHigh,
	lose,
}: {
	winLow: number
	winHigh: number
	lose: number
}) {
	return (
		<>
			<span className={css({ color: "success.default", fontWeight: "bold" })}>
				+{winLow}–{winHigh}
			</span>
			<span className={css({ color: "fg.subtle" })}> / </span>
			<span className={css({ color: "danger.default", fontWeight: "bold" })}>
				−{lose}
			</span>
		</>
	)
}
