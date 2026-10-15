import { Breadcrumb } from "#/components/ui/breadcrumb"
import type { GameEntryQuery } from "#/graphql/generated/graphql"

type Game = NonNullable<GameEntryQuery["game"]>

export function GamePicksBreadcrumb({
	game,
	crumbGroup,
	matchup,
	gameParams,
	username,
}: {
	game: Game
	crumbGroup: { id: string; name: string } | null
	matchup: string
	gameParams: { gameId: string; slug: string }
	username: string
}) {
	return (
		<Breadcrumb>
			{crumbGroup ? (
				<>
					<Breadcrumb.Link
						to="/groups/$groupId"
						params={{ groupId: crumbGroup.id }}
					>
						{crumbGroup.name}
					</Breadcrumb.Link>
					<Breadcrumb.Link
						to="/groups/$groupId/games/$gameId"
						params={{ groupId: crumbGroup.id, gameId: game.id }}
					>
						{matchup}
					</Breadcrumb.Link>
				</>
			) : (
				<>
					<Breadcrumb.Link
						to="/leagues/$leagueSlug/games"
						params={{ leagueSlug: game.league.slug }}
						search={{ windowKey: game.windowKey }}
					>
						{game.league.abbreviation}
					</Breadcrumb.Link>
					<Breadcrumb.Link to="/games/$gameId/{-$slug}" params={gameParams}>
						{matchup}
					</Breadcrumb.Link>
				</>
			)}
			<Breadcrumb.Current>@{username}</Breadcrumb.Current>
		</Breadcrumb>
	)
}
