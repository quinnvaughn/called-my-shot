import { Link } from "@tanstack/react-router"
import { FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { TeamBadge } from "#/components/ui/team-badge"
import type { GameStatus } from "#/graphql/generated/graphql"
import { gameScoreLabel, gameTimeLabel } from "#/lib/game-status"

type Props = {
	game: {
		id: string
		status: GameStatus
		startsAt: string
		homeScore: number | null
		awayScore: number | null
		questionCount: number
		viewerCalledCount: number | null
		homeTeam: { name: string; abbreviation: string; color: string }
		awayTeam: { name: string; abbreviation: string; color: string }
	}
}

function questionsSubline(
	questionCount: number,
	viewerCalledCount: number | null,
): string {
	if (questionCount === 0) return "No questions yet"
	const label = `${questionCount} question${questionCount === 1 ? "" : "s"}`
	if (viewerCalledCount === null) return label
	return viewerCalledCount === 0
		? `${label} · none called`
		: `${label} · ${viewerCalledCount} called`
}

// The league Games tab's row - one real-world matchup, with enough of a
// preview (question/called counts, live status) to decide whether it's worth
// tapping into. Not GameBlock (components/questions/game-block.tsx): that's a
// compact inline badge built for sitting inside a question/call card, too
// small to carry team names or the counts this tab needs.
export function GameRow({ game }: Props) {
	const live = game.status === "LIVE"
	const final = game.status === "FINAL"

	return (
		<Link
			to="/games/$gameId"
			params={{ gameId: game.id }}
			className={css({ display: "block" })}
		>
			<Card interactive size="sm">
				<Card.Body>
					<HStack justify="space-between" alignItems="center" gap="3">
						<VStack alignItems="flex-start" gap="1.5" minWidth="0" flex="1">
							<HStack gap="2" alignItems="center" flexWrap="wrap">
								<TeamBadge
									abbreviation={game.awayTeam.abbreviation}
									color={game.awayTeam.color}
								/>
								<span
									className={css({ fontFamily: "mono", fontSize: "2xs", color: "fg.subtle" })}
								>
									@
								</span>
								<TeamBadge
									abbreviation={game.homeTeam.abbreviation}
									color={game.homeTeam.color}
								/>
								<span
									className={css({
										fontSize: "sm",
										fontWeight: "medium",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									})}
								>
									{game.awayTeam.name} @ {game.homeTeam.name}
								</span>
							</HStack>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: game.viewerCalledCount ? "fg.default" : "fg.subtle",
								})}
							>
								{questionsSubline(game.questionCount, game.viewerCalledCount)}
							</span>
						</VStack>

						<HStack gap="3" alignItems="center" flexShrink="0">
							<VStack alignItems="flex-end" gap="0.5">
								{live ? (
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
											className={css({
												fontFamily: "mono",
												fontSize: "2xs",
												fontWeight: "bold",
												letterSpacing: "wide",
											})}
										>
											LIVE
										</span>
									</HStack>
								) : (
									<span
										className={css({ fontFamily: "mono", fontSize: "2xs", color: "fg.subtle" })}
									>
										{final ? "FINAL" : gameTimeLabel(game)}
									</span>
								)}
								{(live || final) && (
									<span className={css({ fontFamily: "mono", fontSize: "sm", fontWeight: "bold" })}>
										{gameScoreLabel(game)}
									</span>
								)}
							</VStack>
							<FiChevronRight className={css({ color: "fg.subtle" })} />
						</HStack>
					</HStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
