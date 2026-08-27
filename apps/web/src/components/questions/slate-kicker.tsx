import { FiLayers } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"

export type SlateMembership = {
	slate: {
		name: string
		memberCount: number
		viewerCalledCount: number | null
	}
} | null

type Props = {
	membership: SlateMembership
}

// Renders nothing for the overwhelming majority of questions, which aren't
// part of any (published) slate - QuestionCard and CallCard both pass their
// own colocated fragment's slateMembership straight through, no mapping
// needed. viewerCalledCount null/0 reads as "hasn't started this slate yet"
// (shows the plain count instead of a progress fraction) - matches the
// Slate type's own null-or-zero convention.
export function SlateKicker({ membership }: Props) {
	if (!membership) return null
	const { slate } = membership

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
				{slate.name} ·{" "}
				{match(slate.viewerCalledCount)
					.with(P.union(null, 0), () =>
						slate.memberCount === 1
							? "1 question"
							: `${slate.memberCount} questions`,
					)
					.with(slate.memberCount, () => "All called")
					.otherwise(
						(calledCount) => `${calledCount} of ${slate.memberCount} called`,
					)}
			</span>
		</HStack>
	)
}
