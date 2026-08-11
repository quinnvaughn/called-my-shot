import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/_authed/groups/$groupId")({
	component: RouteComponent,
})

function RouteComponent() {
	const { groupId } = Route.useParams()
	return <div>Hello "/_app/_authed/groups/{groupId}"!</div>
}
