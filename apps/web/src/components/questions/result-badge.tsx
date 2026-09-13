import { css } from "styled-system/css"
import { Tag } from "#/components/ui/tag"
import { resultState } from "#/lib/call-summary"

type Props = {
	totalPoints: number | null
	// Set when resolution left the call out of scoring, so it will never have
	// points to show.
	unscoredReason?: string | null
}

// Win/pending badge for a call, sat next to the caller's identity (see
// PersonLine) rather than buried at the end of the pick row.
export function ResultBadge({ totalPoints, unscoredReason }: Props) {
	if (unscoredReason) return <Tag>Not scored</Tag>

	const result = resultState(totalPoints)

	if (result.status === "pending") return <Tag>Pending</Tag>

	return (
		<span
			className={css({
				fontSize: "xs",
				fontFamily: "mono",
				fontWeight: "bold",
				whiteSpace: "nowrap",
				padding: "{spacing.1} {spacing.2.5}",
				borderRadius: "sm",
				color: result.status === "win" ? "success.default" : "danger.default",
				backgroundColor:
					result.status === "win" ? "success.subtle" : "danger.subtle",
			})}
		>
			{result.status === "win" ? "+" : ""}
			{result.points} PTS
		</span>
	)
}
