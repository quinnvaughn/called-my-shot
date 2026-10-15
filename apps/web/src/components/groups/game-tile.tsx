import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GameBlock } from "#/components/questions/game-block"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"

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

export function GameTile({
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
						textStyle: "meta",
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
