import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
	GroupRecordBook,
	recordBookQuery,
} from "#/components/groups/group-record-book/group-record-book"

// Who won each week, and the group's records.
export const Route = createFileRoute(
	"/_app/_authed/groups/$groupId/_tabs/record-book",
)({
	component: RouteComponent,
	loader: ({ context, params }) =>
		context.queryClient.query(recordBookQuery(params.groupId)),
})

function RouteComponent() {
	const { groupId } = Route.useParams()
	const { data } = useSuspenseQuery(recordBookQuery(groupId))
	// The layout already shows the not-found state for a missing group.
	if (!data.group) return null
	return <GroupRecordBook data={data.group} />
}
