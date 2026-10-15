import { css } from "styled-system/css"
import { SignedPoints } from "#/components/ui/signed-points"
import { openCallRange } from "#/lib/challenge"
import { mono } from "./styles"
import type { Call, Entry } from "./types"

// What a call counts for in the 1v1, as far as it can be said yet: what it
// stands to win or lose while the question is open, what it scored once it
// settles.
export function PointsCell({
	entry,
	call,
	scored,
}: {
	entry: Entry
	call: Call | null
	scored: number | null | undefined
}) {
	const status = entry.question.status
	if (status === "VOIDED") return <span className={mono}>void</span>
	if (status === "RESOLVED" || status === "DISPUTED") {
		const points = scored ?? 0
		return (
			<SignedPoints
				value={points}
				className={css({
					fontFamily: "mono",
					fontSize: "sm",
					fontWeight: "bold",
				})}
			/>
		)
	}
	const range = openCallRange(entry, call)
	if (!range) return null
	return (
		<span
			className={css({
				textStyle: "metaLg",
				whiteSpace: "nowrap",
			})}
		>
			<span className={css({ color: "success.default", fontWeight: "bold" })}>
				{range.winLow === range.winHigh
					? `+${range.winLow}`
					: `+${range.winLow}-${range.winHigh}`}
			</span>
			<span className={css({ color: "fg.subtle" })}> / </span>
			<span className={css({ color: "danger.default", fontWeight: "bold" })}>
				−{range.lose}
			</span>
		</span>
	)
}
