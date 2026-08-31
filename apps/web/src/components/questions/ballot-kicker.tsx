import { FiLayers } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"

export type BallotMembership = {
	ballot: {
		name: string
		memberCount: number
		viewerCalledCount: number | null
	}
} | null

type Props = {
	membership: BallotMembership
}

// Renders nothing for the overwhelming majority of questions, which aren't
// part of any (published) ballot - QuestionCard and CallCard both pass their
// own colocated fragment's ballotMembership straight through, no mapping
// needed. viewerCalledCount null/0 reads as "hasn't started this ballot yet"
// (shows the plain count instead of a progress fraction) - matches the
// Ballot type's own null-or-zero convention.
export function BallotKicker({ membership }: Props) {
	if (!membership) return null
	const { ballot } = membership

	return (
		<HStack
			gap="1.5"
			alignItems="center"
			minWidth="0"
			className={css({ color: "fg.subtle" })}
		>
			<FiLayers size={11} className={css({ flexShrink: "0" })} />
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				})}
			>
				{ballot.name} ·{" "}
				{match(ballot.viewerCalledCount)
					.with(P.union(null, 0), () =>
						ballot.memberCount === 1
							? "1 question"
							: `${ballot.memberCount} questions`,
					)
					.with(ballot.memberCount, () => "All called")
					.otherwise(
						(calledCount) => `${calledCount} of ${ballot.memberCount} called`,
					)}
			</span>
		</HStack>
	)
}
