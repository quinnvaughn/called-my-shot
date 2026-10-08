import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GameBlock } from "#/components/questions/game-block"
import { CardRail } from "#/components/ui/card-rail"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"
import { IN_PLAY_REFETCH_MS, isGameInPlay } from "#/lib/game-status"

export const GroupGamesStripFragment = graphql(`
	fragment GroupGamesStrip_game on GroupGame {
		callerCount
		game {
			id
			status
			startsAt
			homeScore
			awayScore
			startTimeTbd
			league {
				id
				abbreviation
			}
			homeTeam {
				id
				abbreviation
				color
				logoUrl
			}
			awayTeam {
				id
				abbreviation
				color
				logoUrl
			}
		}
	}
`)

export const GroupLiveGamesDocument = graphql(`
	query GroupLiveGames($groupId: ID!) {
		group(id: $groupId) {
			id
			liveGames {
				game {
					id
					status
					startsAt
				}
				...GroupGamesStrip_game
			}
		}
	}
`)

// Seeded from GroupDetail by the group route's loader, so the strip costs no
// request of its own on load. Re-read on its own while a listed game is on,
// so the scores move without refetching the rest of the page.
export const groupLiveGamesQuery = (groupId: string) =>
	gqlQueryOptions(
		GroupLiveGamesDocument,
		{ groupId },
		{
			refetchInterval: (query) =>
				query.state.data?.group?.liveGames.some((g) => isGameInPlay(g.game))
					? IN_PLAY_REFETCH_MS
					: false,
		},
	)

const headingClass = css({
	fontFamily: "mono",
	fontSize: "xs",
	letterSpacing: "wide",
	color: "fg.muted",
	textTransform: "uppercase",
})

// Games the group has calls on that are on now, start within a day, or just
// ended, each leading to the group's board for that game. Renders nothing
// when there aren't any.
export function GroupGamesStrip({ groupId }: { groupId: string }) {
	const { data } = useSuspenseQuery(groupLiveGamesQuery(groupId))
	const games = data.group?.liveGames ?? []
	if (games.length === 0) return null

	return (
		<CardRail
			items={games}
			getKey={(g) => g.game.id}
			itemLabel="game"
			header={<h2 className={headingClass}>Games</h2>}
			renderItem={(g) => <GameTile groupId={groupId} game={g} />}
		/>
	)
}

function GameTile({
	groupId,
	game: gameProp,
}: {
	groupId: string
	game: FragmentType<typeof GroupGamesStripFragment>
}) {
	const { callerCount, game } = useFragment(GroupGamesStripFragment, gameProp)
	return (
		<Link
			to="/groups/$groupId/games/$gameId"
			params={{ groupId, gameId: game.id }}
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
				borderRadius: "lg",
				_hover: { opacity: 0.85 },
			})}
		>
			<VStack gap="1.5" alignItems="stretch">
				<GameBlock game={game} />
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
						paddingInline: "1",
					})}
				>
					{game.league.abbreviation} · {callerCount} in the group called it
				</span>
			</VStack>
		</Link>
	)
}
