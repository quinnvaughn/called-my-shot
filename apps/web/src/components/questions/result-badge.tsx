import { css } from "styled-system/css"
import { Tag } from "#/components/ui/tag"
import { resultState } from "#/lib/call-summary"

type Props = {
	totalPoints: number | null
}

// Win/pending badge for a call, sat next to the caller's identity (see
// PersonLine) rather than buried at the end of the pick row.
export function ResultBadge({ totalPoints }: Props) {
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
