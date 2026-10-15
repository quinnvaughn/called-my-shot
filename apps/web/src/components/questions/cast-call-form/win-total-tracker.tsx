import { css } from "styled-system/css"
import {
	type WinTotalBudget,
	winTotalTrackerLine,
} from "#/lib/win-total-tracker"

// Where this pick puts the viewer's win-totals ballot against the wins the
// schedule actually hands out, updating as the guess moves.
export function WinTotalTracker({
	budget,
	guess,
}: {
	budget: WinTotalBudget
	guess: number
}) {
	const { text, off } = winTotalTrackerLine(budget, guess)
	return (
		<span
			className={css({
				fontSize: "sm",
				textAlign: "center",
				color: off ? "warning.default" : "fg.muted",
				maxWidth: "md",
			})}
		>
			{text}
		</span>
	)
}
