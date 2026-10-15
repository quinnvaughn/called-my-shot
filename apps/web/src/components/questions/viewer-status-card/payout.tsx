import { css } from "styled-system/css"

export function Payout({ win, lose }: { win: number; lose: number }) {
	return (
		<>
			<span className={css({ color: "success.default", fontWeight: "bold" })}>
				+{win}
			</span>
			<span className={css({ color: "fg.subtle" })}> / </span>
			<span className={css({ color: "danger.default", fontWeight: "bold" })}>
				−{lose}
			</span>
		</>
	)
}
