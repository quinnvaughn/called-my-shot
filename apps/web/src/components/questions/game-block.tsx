import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { TeamBadge } from "#/components/ui/team-badge"
import type { GameStatus } from "#/graphql/generated/graphql"
import { gameStatusLabel } from "#/lib/game-status"

type Props = {
	game: {
		status: GameStatus
		startsAt: string
		homeScore: number | null
		awayScore: number | null
		homeTeam: { abbreviation: string; color: string }
		awayTeam: { abbreviation: string; color: string }
	}
}

// The single real-world matchup a question is about - away @ home, plus
// either when it starts (still to come) or the score (in progress/final).
// Shared by QuestionCard, CallCard (both via QuestionSummaryHeader) and the
// question's own detail page, which all show the same block.
export function GameBlock({ game }: Props) {
	return (
		<HStack
			justify="space-between"
			alignItems="center"
			flexWrap="wrap"
			gap="2"
			className={css({
				border: "1px solid {colors.border.default}",
				borderRadius: "lg",
				bg: "bg.subtle",
				paddingInline: "3",
				paddingBlock: "2.5",
			})}
		>
			<HStack gap="2" alignItems="center">
				<TeamBadge
					abbreviation={game.awayTeam.abbreviation}
					color={game.awayTeam.color}
				/>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					@
				</span>
				<TeamBadge
					abbreviation={game.homeTeam.abbreviation}
					color={game.homeTeam.color}
				/>
			</HStack>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.muted",
					whiteSpace: "nowrap",
				})}
			>
				{gameStatusLabel(game)}
			</span>
		</HStack>
	)
}
