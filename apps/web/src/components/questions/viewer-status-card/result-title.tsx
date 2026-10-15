import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import type { PickSubject } from "./types"

export function ResultTitle({
	answer,
	subject,
	disputed,
}: {
	answer: string
	subject: PickSubject | null
	disputed: boolean
}) {
	return (
		<HStack gap="2.5" alignItems="center" minWidth="0">
			{subject && (
				<PlayerOrTeamImage player={subject.player} team={subject.team} />
			)}
			<span
				className={css({
					fontFamily: "heading",
					fontSize: "xl",
					lineHeight: "1.3",
					color: disputed ? "warning.default" : "fg.default",
				})}
			>
				{disputed && "Disputed: "}
				{answer}
			</span>
		</HStack>
	)
}
