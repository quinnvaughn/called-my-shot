import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import type { ChallengePointsRange } from "#/lib/challenge"

const value = css({ fontFamily: "mono", fontSize: "sm", fontWeight: "bold" })

// What a call stands to count for in the 1v1: what it adds if it's right and
// what it takes away if it's wrong. A numeric guess's win depends on how close
// it lands, so it's a range.
export function PossiblePoints({ range }: { range: ChallengePointsRange }) {
	const win =
		range.winLow === range.winHigh
			? `+${range.winLow}`
			: `+${range.winLow} to +${range.winHigh}`
	return (
		<HStack
			gap="3"
			flexWrap="wrap"
			className={css({ fontFamily: "mono", fontSize: "xs", color: "fg.muted" })}
		>
			<span>
				<span className={css({ color: "success.default" })}>
					<span className={value}>{win}</span>
				</span>{" "}
				if right
			</span>
			<span>
				<span className={css({ color: "danger.default" })}>
					<span className={value}>−{range.lose}</span>
				</span>{" "}
				if wrong
			</span>
		</HStack>
	)
}
