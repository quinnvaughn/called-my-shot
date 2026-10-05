import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { formatPayout } from "#/lib/call-summary"
import { RecordStat } from "./call-record-card"
import { LockLine } from "./lock-line"

export const CallPointsFragment = graphql(`
	fragment CallPoints_call on Call {
		id
		totalPoints
		unscoredReason
		payout {
			winLow
			winHigh
			lose
		}
		question {
			id
			status
			locksAt
		}
	}
`)

type Props = {
	call: FragmentType<typeof CallPointsFragment>
}

// The points at the card's scale. Settled, the final number, as big as the
// call page states it. Before that, what the call pays if right and costs if
// wrong on one quiet line with when it locks, so a feed of open
// calls doesn't turn into a wall of green and red.
export function CallPoints({ call: callProp }: Props) {
	const call = useFragment(CallPointsFragment, callProp)
	const status = call.question.status
	if (status === "RESOLVED" || status === "DISPUTED") {
		if (call.unscoredReason || call.totalPoints === null) return null
		return (
			<RecordStat
				value={`${call.totalPoints >= 0 ? "+" : "−"}${Math.abs(call.totalPoints)}`}
				label="Final"
				tone={call.totalPoints >= 0 ? "success" : "danger"}
			/>
		)
	}
	if (status === "VOIDED") return null

	// Locked needs no line of its own here: the tag already says it.
	const payout = call.payout ? formatPayout(call.payout) : null
	if (!payout && status !== "OPEN") return null
	return (
		<span
			className={css({
				fontFamily: "mono",
				fontSize: "xs",
				color: "fg.subtle",
				whiteSpace: "nowrap",
			})}
		>
			{payout && (
				<>
					<span
						className={css({ color: "success.default", fontWeight: "bold" })}
					>
						{payout.win}
					</span>
					{" / "}
					<span
						className={css({ color: "danger.default", fontWeight: "bold" })}
					>
						{payout.lose}
					</span>
				</>
			)}
			{payout && status === "OPEN" && " · "}
			{status === "OPEN" && (
				<LockLine status={status} locksAt={call.question.locksAt} />
			)}
		</span>
	)
}
