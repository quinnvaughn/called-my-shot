import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { TeamBadge } from "#/components/ui/team-badge"
import type { GameStatus } from "#/graphql/generated/graphql"
import {
	formatTeamRecord,
	gameScoreLabel,
	gameStartLabel,
} from "#/lib/game-status"

type TeamRecord = { wins: number; losses: number; ties: number } | null

type Props = {
	game: {
		status: GameStatus
		startsAt: string
		homeScore: number | null
		awayScore: number | null
		venue: string | null
		homeTeam: { name: string; abbreviation: string; color: string }
		awayTeam: { name: string; abbreviation: string; color: string }
		homeTeamRecord?: TeamRecord
		awayTeamRecord?: TeamRecord
	}
}

const nameClass = css({
	fontSize: "md",
	fontWeight: "bold",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

const recordClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.subtle",
})

// The game detail page's own bigger matchup header - not GameBlock
// (components/questions/game-block.tsx), which stays the small inline badge
// shared by QuestionCard/CallCard/QuestionSummaryHeader everywhere else.
// This is the one place in the app prominent enough to warrant full team
// names, a real score, and each team's record.
export function GameMatchupHeader({ game }: Props) {
	const live = game.status === "LIVE"
	const final = game.status === "FINAL"

	return (
		<VStack
			gap="3"
			alignItems="stretch"
			className={css({
				border: "1px solid {colors.border.default}",
				borderRadius: "xl",
				bg: "bg.subtle",
				padding: "4",
			})}
		>
			<HStack justify="space-between" alignItems="center" gap="3">
				<HStack gap="2.5" alignItems="center" minWidth="0" flex="1">
					<TeamBadge
						abbreviation={game.awayTeam.abbreviation}
						color={game.awayTeam.color}
					/>
					<VStack gap="0" alignItems="flex-start" minWidth="0">
						<span className={nameClass}>{game.awayTeam.name}</span>
						{formatTeamRecord(game.awayTeamRecord ?? null) && (
							<span className={recordClass}>
								{formatTeamRecord(game.awayTeamRecord ?? null)}
							</span>
						)}
					</VStack>
				</HStack>

				<VStack gap="0.5" alignItems="center" flexShrink="0">
					{live || final ? (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xl",
								fontWeight: "bold",
							})}
						>
							{gameScoreLabel(game)}
						</span>
					) : (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "sm",
								color: "fg.subtle",
							})}
						>
							@
						</span>
					)}
				</VStack>

				<HStack
					gap="2.5"
					alignItems="center"
					minWidth="0"
					flex="1"
					justify="flex-end"
				>
					<VStack gap="0" alignItems="flex-end" minWidth="0">
						<span className={nameClass}>{game.homeTeam.name}</span>
						{formatTeamRecord(game.homeTeamRecord ?? null) && (
							<span className={recordClass}>
								{formatTeamRecord(game.homeTeamRecord ?? null)}
							</span>
						)}
					</VStack>
					<TeamBadge
						abbreviation={game.homeTeam.abbreviation}
						color={game.homeTeam.color}
					/>
				</HStack>
			</HStack>

			<HStack
				justify="center"
				gap="2"
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.muted",
					flexWrap: "wrap",
				})}
			>
				{live && (
					<HStack gap="1.5" alignItems="center">
						<span
							className={css({
								width: "1.5",
								height: "1.5",
								borderRadius: "full",
								bg: "success.default",
								animation: "pulse 1.6s ease-in-out infinite",
							})}
						/>
						<span
							className={css({ fontWeight: "bold", letterSpacing: "wide" })}
						>
							LIVE
						</span>
					</HStack>
				)}
				{final && <span className={css({ fontWeight: "bold" })}>FINAL</span>}
				{!live && !final && <span>{gameStartLabel(game)}</span>}
				{game.venue && (
					<>
						<span>·</span>
						<span>{game.venue}</span>
					</>
				)}
			</HStack>
		</VStack>
	)
}
