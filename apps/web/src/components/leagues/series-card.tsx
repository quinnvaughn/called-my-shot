import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { TeamBadge } from "#/components/ui/team-badge"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { gameStatusLabel } from "#/lib/game-status"
import { seededName } from "#/lib/postseason"
import { buildGameSlug } from "#/lib/slug"

export const SeriesCardFragment = graphql(`
	fragment SeriesCard_series on PostseasonSeries {
		id
		roundLabel
		bestOf
		summary
		winnerTeamId
		teams {
			seed
			wins
			eliminated
			team {
				...Team_team @unmask
			}
		}
		spotlightGame {
			id
			startsAt
			status
			homeScore
			awayScore
			startTimeTbd
			postseason {
				gameNumber
			}
			homeTeam {
				id
				name
			}
			awayTeam {
				id
				name
			}
		}
	}
`)

export type Series = FragmentType<typeof SeriesCardFragment>

export function SeriesCard({
	series: seriesRef,
	leagueSlug,
}: {
	series: Series
	leagueSlug: string
}) {
	const series = useFragment(SeriesCardFragment, seriesRef)
	const decided = series.winnerTeamId !== null
	const game = series.spotlightGame
	const footer = decided
		? series.summary
		: game
			? [
					game.postseason?.gameNumber
						? `Game ${game.postseason.gameNumber}`
						: null,
					gameStatusLabel(game),
				]
					.filter(Boolean)
					.join(" · ")
			: series.summary

	const card = (
		<Card
			interactive={!!game}
			size="sm"
			className={css({ height: "full", opacity: decided ? 0.6 : 1 })}
		>
			<Card.Body>
				<VStack gap="2.5" alignItems="stretch">
					<HStack justify="space-between" gap="2">
						<Eyebrow size="sm" variant="neutral">
							{series.roundLabel}
						</Eyebrow>
						{series.bestOf && (
							<span
								className={css({
									textStyle: "meta",
									color: "fg.subtle",
									whiteSpace: "nowrap",
								})}
							>
								Best of {series.bestOf}
							</span>
						)}
					</HStack>
					<VStack gap="1.5" alignItems="stretch">
						{series.teams.map((side) => (
							<HStack key={side.team.id} gap="2" alignItems="center">
								<TeamBadge
									abbreviation={side.team.abbreviation}
									color={side.team.color}
									logoUrl={side.team.logoUrl}
								/>
								<span
									className={css({
										flex: 1,
										minWidth: "0",
										fontSize: "sm",
										fontWeight: "medium",
										truncate: true,
										color: side.eliminated ? "fg.subtle" : "fg.default",
										textDecoration: side.eliminated ? "line-through" : "none",
									})}
								>
									{seededName(side.team.name, side.seed)}
								</span>
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "md",
										fontWeight: "bold",
										color: side.eliminated ? "fg.subtle" : "fg.default",
									})}
								>
									{side.wins}
								</span>
							</HStack>
						))}
					</VStack>
					{footer && (
						<span
							className={css({
								textStyle: "label",
								color: decided ? "fg.subtle" : "secondary.default",
							})}
						>
							{footer}
						</span>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)

	if (!game) return card
	return (
		<Link
			to="/games/$gameId/{-$slug}"
			params={{
				gameId: game.id,
				slug: buildGameSlug({ ...game, league: { slug: leagueSlug } }),
			}}
			className={css({ display: "grid" })}
		>
			{card}
		</Link>
	)
}
