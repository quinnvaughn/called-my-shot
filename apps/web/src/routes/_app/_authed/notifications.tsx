import { createFileRoute } from "@tanstack/react-router"
import { NotificationsList } from "#/components/notifications/notifications-list"
import { notificationsQuery } from "#/graphql/notifications/queries"

export const Route = createFileRoute("/_app/_authed/notifications")({
	component: RouteComponent,
	loader: ({ context }) =>
		context.queryClient.infiniteQuery(notificationsQuery()),
})

function RouteComponent() {
	return <NotificationsList />
}
