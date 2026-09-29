import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { CardRail } from "#/components/ui/card-rail"
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
				id
				name
				abbreviation
				color
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

type Series = FragmentType<typeof SeriesCardFragment>

type Props = {
	// id and winnerTeamId selected beside the fragment, to key and order the
	// cards without unmasking it here.
	series: ({ id: string; winnerTeamId: string | null } & Series)[]
	// The rounds on now, as one phrase (see roundsPhrase).
	heading: string
	leagueSlug: string
}

// The postseason's current rounds at a glance, above the Games tab's day
// stepper: one card per series with where it stands and its next game.
// Finished series trail the ones still being played.
export function SeriesStrip({ series, heading, leagueSlug }: Props) {
	const items = [...series].sort(
		(a, b) => Number(a.winnerTeamId !== null) - Number(b.winnerTeamId !== null),
	)
	return (
		<CardRail
			items={items}
			getKey={(item) => item.id}
			header={<Eyebrow size="sm">{heading}</Eyebrow>}
			itemLabel="series"
			renderItem={(item) => <SeriesCard series={item} leagueSlug={leagueSlug} />}
		/>
	)
}

function SeriesCard({
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
					game.postseason?.gameNumber ? `Game ${game.postseason.gameNumber}` : null,
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
									fontFamily: "mono",
									fontSize: "2xs",
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
								/>
								<span
									className={css({
										flex: 1,
										minWidth: "0",
										fontSize: "sm",
										fontWeight: "medium",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
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
								fontFamily: "mono",
								fontSize: "2xs",
								letterSpacing: "wide",
								textTransform: "uppercase",
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
