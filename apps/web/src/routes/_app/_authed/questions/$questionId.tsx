import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/_authed/questions/$questionId")({
	component: RouteComponent,
})

function RouteComponent() {
	return <div>Hello "/_app/_authed/questions/$questionId"!</div>
}
