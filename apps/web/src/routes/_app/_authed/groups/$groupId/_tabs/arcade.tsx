import { createFileRoute } from "@tanstack/react-router"
import { GroupArcadeTab } from "#/components/groups/group-arcade/group-arcade-tab"
import { groupArcadeWeekQuery } from "#/graphql/arcade/queries"
import { groupRankBoardQuery } from "#/graphql/blind-rank/queries"
import { groupSeasonBoardQuery } from "#/graphql/season-puzzles/queries"

// The group's arcade games: today's board for each, member by member, and the
// week's standings across both.
export const Route = createFileRoute(
	"/_app/_authed/groups/$groupId/_tabs/arcade",
)({
	component: RouteComponent,
	loader: ({ context, params }) =>
		Promise.all([
			context.queryClient.query(groupSeasonBoardQuery(params.groupId)),
			context.queryClient.query(groupRankBoardQuery(params.groupId)),
			context.queryClient.query(groupArcadeWeekQuery(params.groupId)),
		]),
})

function RouteComponent() {
	const { groupId } = Route.useParams()
	return <GroupArcadeTab groupId={groupId} />
}
