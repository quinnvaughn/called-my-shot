import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { GroupChains } from "#/components/groups/group-chains/group-chains"
import { finishedChainsQuery, groupChainsQuery } from "#/graphql/chains/queries"

// The group's chains: open ones to join, ones playing out, and how the rest
// ended.
export const Route = createFileRoute(
	"/_app/_authed/groups/$groupId/_tabs/chains",
)({
	component: RouteComponent,
	loader: ({ context, params }) =>
		Promise.all([
			context.queryClient.query(groupChainsQuery(params.groupId)),
			context.queryClient.prefetchInfiniteQuery(
				finishedChainsQuery(params.groupId),
			),
		]),
})

function RouteComponent() {
	const { groupId } = Route.useParams()
	const { data } = useSuspenseQuery(groupChainsQuery(groupId))
	// The layout already shows the not-found state for a missing group.
	if (!data.group) return null
	return (
		<GroupChains
			groupId={groupId}
			chains={data.group.activeChains}
			canStart={data.group.viewerIsMember}
		/>
	)
}
