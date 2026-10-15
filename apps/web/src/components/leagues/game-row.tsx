import { Link } from "@tanstack/react-router"
import { FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { LiveDot } from "#/components/ui/live-dot"
import { Tag } from "#/components/ui/tag"
import { TeamBadge } from "#/components/ui/team-badge"
import type { GameStatus } from "#/graphql/generated/graphql"
import { gameScoreLabel, gameTimeLabel } from "#/lib/game-status"
import { pluralize } from "#/lib/pluralize"
import { seededName, seriesStakesLabel } from "#/lib/postseason"
import { buildGameSlug } from "#/lib/slug"
import { GameRowCallers } from "./game-row-callers"

type Props = {
	// The league room already knows which league it is rendering; the game
	// rows themselves don't carry it, and buildGameSlug needs it.
	leagueSlug: string
	game: {
		id: string
		status: GameStatus
		atHalftime: boolean
		statusDetail?: string | null
		startsAt: string
		homeScore: number | null
		awayScore: number | null
		questionCount: number
		viewerCalledCount: number | null
		callerCount: number
		viewerGroupCallers: {
			count: number
			preview: { id: string; name: string; avatarUrl?: string | null }[]
		}
		startTimeTbd: boolean
		// The round itself is the heading this row sits under on a postseason
		// day, so only the game's place in its series is here.
		postseason: {
			homeSeed: number | null
			awaySeed: number | null
			gameNumber: number | null
			ifNecessary: boolean
			summary: string | null
			clinchTeamIds: string[]
		} | null
		homeTeam: {
			name: string
			abbreviation: string
			color: string
			logoUrl?: string | null
		}
		awayTeam: {
			name: string
			abbreviation: string
			color: string
			logoUrl?: string | null
		}
	}
}

// "Game 4 · SEA leads 2-1". Null outside a series.
function seriesLine(postseason: Props["game"]["postseason"]): string | null {
	if (!postseason?.gameNumber) return null
	return [`Game ${postseason.gameNumber}`, postseason.summary]
		.filter(Boolean)
		.join(" · ")
}

function questionsSubline(
	questionCount: number,
	viewerCalledCount: number | null,
): string {
	if (questionCount === 0) return "No questions yet"
	const label = `${questionCount} ${pluralize(questionCount, "question")}`
	if (viewerCalledCount === null) return label
	return viewerCalledCount === 0
		? `${label} · you called none`
		: `${label} · you called ${viewerCalledCount}`
}

// The league Games tab's row - one real-world matchup, with enough of a
// preview (question/called counts, who else called it, live status) to
// decide whether it's worth tapping into. Not GameBlock (components/questions/game-block.tsx): that's a
// compact inline badge built for sitting inside a question/call card, too
// small to carry team names or the counts this tab needs.
export function GameRow({ game, leagueSlug }: Props) {
	const live = game.status === "LIVE"
	const final = game.status === "FINAL"
	const series = seriesLine(game.postseason)
	const stakes =
		game.postseason && !final && !game.postseason.ifNecessary
			? seriesStakesLabel(game.postseason)
			: null

	return (
		<Link
			to="/games/$gameId/{-$slug}"
			params={{
				gameId: game.id,
				slug: buildGameSlug({ ...game, league: { slug: leagueSlug } }),
			}}
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
									logoUrl={game.awayTeam.logoUrl}
								/>
								<span
									className={css({
										textStyle: "meta",
										color: "fg.subtle",
									})}
								>
									@
								</span>
								<TeamBadge
									abbreviation={game.homeTeam.abbreviation}
									color={game.homeTeam.color}
									logoUrl={game.homeTeam.logoUrl}
								/>
								{/* Without minWidth the nowrap name holds its full min-content
								    width and runs under the status column instead of ellipsing.
								    A phone has no width to ellipse into either, so there the
								    matchup wraps onto its own lines (same treatment as Identity's
								    name). */}
								<span
									className={css({
										fontSize: "sm",
										fontWeight: "medium",
										minWidth: "0",
										overflowWrap: { base: "anywhere", md: "normal" },
										overflow: { base: "visible", md: "hidden" },
										textOverflow: { md: "ellipsis" },
										whiteSpace: { base: "normal", md: "nowrap" },
									})}
								>
									{seededName(game.awayTeam.name, game.postseason?.awaySeed)} @{" "}
									{seededName(game.homeTeam.name, game.postseason?.homeSeed)}
								</span>
							</HStack>
							{(series || game.postseason?.ifNecessary || stakes) && (
								<HStack gap="2" alignItems="center" flexWrap="wrap">
									{series && (
										<span
											className={css({
												textStyle: "label",
												color: "secondary.default",
											})}
										>
											{series}
										</span>
									)}
									{game.postseason?.ifNecessary && (
										<Tag size="sm">If necessary</Tag>
									)}
									{stakes && (
										<Tag variant="primary" size="sm">
											{stakes}
										</Tag>
									)}
								</HStack>
							)}
							<span
								className={css({
									textStyle: "meta",
									color: game.viewerCalledCount ? "fg.default" : "fg.subtle",
								})}
							>
								{questionsSubline(game.questionCount, game.viewerCalledCount)}
							</span>
							<GameRowCallers
								callerCount={game.callerCount}
								groupCallers={game.viewerGroupCallers}
							/>
						</VStack>

						<HStack gap="3" alignItems="center" flexShrink="0">
							<VStack alignItems="flex-end" gap="0.5">
								{live ? (
									<HStack gap="1.5" alignItems="center">
										<LiveDot />
										<span
											className={css({
												fontFamily: "mono",
												fontSize: "2xs",
												fontWeight: "bold",
												letterSpacing: "wide",
											})}
										>
											{game.atHalftime ? "HALFTIME" : "LIVE"}
										</span>
										{!game.atHalftime && game.statusDetail && (
											<span
												className={css({
													textStyle: "meta",
													color: "fg.muted",
												})}
											>
												{game.statusDetail}
											</span>
										)}
									</HStack>
								) : (
									<span
										className={css({
											textStyle: "meta",
											color: "fg.subtle",
										})}
									>
										{final ? "FINAL" : gameTimeLabel(game)}
									</span>
								)}
								{(live || final) && (
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "sm",
											fontWeight: "bold",
										})}
									>
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
