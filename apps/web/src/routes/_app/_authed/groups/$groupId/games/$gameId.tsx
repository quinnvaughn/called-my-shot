import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { VStack } from "styled-system/jsx"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { GameSetRail } from "#/components/games/game-set-rail"
import { GroupGameEntryRow } from "#/components/groups/group-game-entry-row"
import { arrowLink } from "#/components/ui/arrow-link"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { EmptyState } from "#/components/ui/empty-state"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { GroupGameBoardDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import {
	IN_PLAY_REFETCH_MS,
	isGameInPlay,
	matchupLabel,
} from "#/lib/game-status"
import { buildGameSlug } from "#/lib/slug"

// Polls while the game is on, so points move as calls settle mid-game and
// the score in the header keeps up.
const groupGameBoardQuery = (groupId: string, gameId: string) =>
	gqlQueryOptions(
		GroupGameBoardDocument,
		{ groupId, gameId },
		{
			refetchInterval: (query) => {
				const game = query.state.data?.group?.gameBoard?.game
				return game && isGameInPlay(game) ? IN_PLAY_REFETCH_MS : false
			},
		},
	)

export const Route = createFileRoute(
	"/_app/_authed/groups/$groupId/games/$gameId",
)({
	component: RouteComponent,
	// The viewer's own calls on the game with where each stands, beside
	// everyone's summary rows. Same rail as the game page.
	staticData: { rightRail: <BoardRail /> },
	staleTime: 0,
	loader: ({ context, params }) =>
		context.queryClient.query(
			groupGameBoardQuery(params.groupId, params.gameId),
		),
})

// Reads the cache entry RouteComponent loads and polls, so the rail moves
// with the board rather than fetching on its own.
function BoardRail() {
	const { groupId, gameId } = Route.useParams()
	const { data } = useSuspenseQuery(groupGameBoardQuery(groupId, gameId))
	const me = useMe()
	const game = data.group?.gameBoard?.game
	if (!game) return null
	return (
		<GameSetRail
			game={game}
			questions={game.officialQuestions}
			communityQuestions={game.viewerCommunityQuestions}
			username={me?.username ?? null}
			gameLinkParams={{ gameId: game.id, slug: buildGameSlug(game) }}
		/>
	)
}

function RouteComponent() {
	const { groupId, gameId } = Route.useParams()
	const { data } = useSuspenseQuery(groupGameBoardQuery(groupId, gameId))
	const me = useMe()
	const group = data.group
	const board = group?.gameBoard

	if (!group || !board) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Group"
				heading={group ? "This game doesn't exist" : "This group doesn't exist"}
				subtitle="It may have been removed, or the link's just wrong."
				link={{ text: "View your groups", url: "/groups" }}
			/>
		)
	}

	const { game, entries } = board
	const matchup = matchupLabel(game)
	const gameParams = { gameId: game.id, slug: buildGameSlug(game) }

	return (
		<VStack gap="6" alignItems="stretch">
			<Breadcrumb>
				<Breadcrumb.Link to="/groups">Groups</Breadcrumb.Link>
				<Breadcrumb.Link to="/groups/$groupId" params={{ groupId: group.id }}>
					{group.name}
				</Breadcrumb.Link>
				<Breadcrumb.Current>{matchup}</Breadcrumb.Current>
			</Breadcrumb>

			<PageHeader title={`${group.name} on ${matchup}`} />

			<GameMatchupHeader game={game} />

			<VStack gap="3" alignItems="stretch">
				{entries.length === 0 ? (
					<EmptyState
						action={
							<Link
								to="/games/$gameId/{-$slug}"
								params={gameParams}
								className={arrowLink({ tone: "primary", align: "parent" })}
							>
								Go to the game →
							</Link>
						}
					>
						No one in the group has called this game yet.
					</EmptyState>
				) : (
					entries.map((entry) => (
						<GroupGameEntryRow
							key={entry.user.id}
							gameId={game.id}
							groupId={group.id}
							entry={entry}
							isViewer={entry.user.id === me?.id}
						/>
					))
				)}
			</VStack>

			{entries.length > 0 && (
				<Link
					to="/games/$gameId/{-$slug}"
					params={gameParams}
					className={arrowLink({ tone: "primary" })}
				>
					Go to the game →
				</Link>
			)}
		</VStack>
	)
}
