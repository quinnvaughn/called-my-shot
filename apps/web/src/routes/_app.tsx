import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AppShell } from "#/components/app-shell/app-shell"
import { LeaguesDocument } from "#/graphql/queries/sports"

export const Route = createFileRoute("/_app")({
	component: RouteComponent,
	// Powers the sidebar's persistent league rail (see app-shell.tsx) - loaded
	// once here rather than in AppShell itself, since AppShell has no route of
	// its own to hang a loader off. Scoped to this pathless layout (not
	// __root__) so admin and the share-image proxy routes, which never render
	// AppShell, don't pay for a query they don't use.
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: LeaguesDocument,
		})
		return { leagues: data?.leagues ?? [] }
	},
})

function RouteComponent() {
	const { leagues } = Route.useLoaderData()
	return (
		<AppShell leagues={leagues}>
			<Outlet />
		</AppShell>
	)
}
