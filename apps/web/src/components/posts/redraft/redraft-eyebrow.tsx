import { css } from "styled-system/css"

// "REDRAFT" over a class's title ("2003 NBA Draft"), which on its own reads
// as the real draft. Takes the color of whatever it sits on, like
// RushmoreEyebrow.
export function RedraftEyebrow() {
	return (
		<span
			className={css({
				display: "block",
				textStyle: "label",
				letterSpacing: "wider",
				opacity: 0.8,
			})}
		>
			Redraft
		</span>
	)
}
