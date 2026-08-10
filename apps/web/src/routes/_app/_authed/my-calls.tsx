import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/_authed/my-calls")({
	component: RouteComponent,
})

function RouteComponent() {
	return <div>Hello "/_app/_authed/my-calls"!</div>
}
