import { createFileRoute } from "@tanstack/react-router"
import { GroupSeasonBoard } from "#/components/groups/group-season/group-season-board"
import { groupSeasonBoardQuery } from "#/graphql/season-puzzles/queries"

// The group's daily games: today's Name That Season member by member, and the
// week's standings.
export const Route = createFileRoute(
	"/_app/_authed/groups/$groupId/_tabs/daily",
)({
	component: RouteComponent,
	loader: ({ context, params }) =>
		context.queryClient.query(groupSeasonBoardQuery(params.groupId)),
})

function RouteComponent() {
	const { groupId } = Route.useParams()
	return <GroupSeasonBoard groupId={groupId} />
}
