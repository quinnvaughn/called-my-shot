import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/user/$username")({
	component: RouteComponent,
})

function RouteComponent() {
	const { username } = Route.useParams()
	return <div>Hello "/_app/user/{username}"!</div>
}
