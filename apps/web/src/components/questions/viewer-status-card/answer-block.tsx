import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import { kickerClass } from "./styles"
import type { PickSubject } from "./types"

const crowdStatClass = css({
	textStyle: "meta",
	color: "fg.muted",
})

// The settled answer under the viewer's own pick: what actually happened,
// and how much of the field saw it coming.
export function AnswerBlock({
	answer,
	subject,
	disputed,
	fieldAccuracyPct,
}: {
	answer: string | null
	subject: PickSubject | null
	disputed: boolean
	fieldAccuracyPct: number | null
}) {
	if (!answer) return null
	return (
		<VStack
			gap="1"
			alignItems="flex-start"
			className={css({
				paddingTop: "3",
				borderTop: "1px solid {colors.border.default}",
			})}
		>
			<span className={kickerClass}>
				{disputed ? "Answer (disputed)" : "Answer"}
			</span>
			<HStack gap="2" alignItems="center" minWidth="0">
				{subject && (
					<PlayerOrTeamImage player={subject.player} team={subject.team} />
				)}
				<span
					className={
						disputed
							? css({ fontSize: "md", color: "warning.default" })
							: css({ fontSize: "md", color: "fg.default" })
					}
				>
					{answer}
				</span>
			</HStack>
			{fieldAccuracyPct !== null && (
				<span className={crowdStatClass}>
					{Math.round(fieldAccuracyPct)}% of the crowd nailed this
				</span>
			)}
		</VStack>
	)
}
