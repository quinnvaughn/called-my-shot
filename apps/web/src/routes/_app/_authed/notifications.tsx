import { createFileRoute } from "@tanstack/react-router"
import { NotificationsList } from "#/components/notifications/notifications-list"
import { NotificationsPageDocument } from "#/graphql/queries/notifications"

export const Route = createFileRoute("/_app/_authed/notifications")({
	component: RouteComponent,
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: NotificationsPageDocument,
		})
		const page =
			data?.notifications.__typename === "QueryNotificationsSuccess"
				? data.notifications.data
				: { items: [], pageInfo: { hasNextPage: false, endCursor: null } }
		return { page }
	},
})

function RouteComponent() {
	const { page } = Route.useLoaderData()
	return (
		<NotificationsList
			initialItems={page.items}
			initialPageInfo={page.pageInfo}
		/>
	)
}
