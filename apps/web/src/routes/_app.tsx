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
	//
	// In beforeLoad rather than a loader so it lands in context before any
	// descendant's loader runs: the league room addresses a league by slug but
	// every league-scoped query underneath it takes an id, and this list is
	// what resolves one to the other (see leagues/$leagueSlug.tsx).
	//
	// cache-first overrides the client-wide network-only default (see
	// apollo-client.ts) - beforeLoad isn't staleTime-gated the way a loader is,
	// so without this every navigation inside the shell would refetch the rail
	// before any page could start loading. This is the one query where that
	// default is wrong: the league list turns over about as often as the sport
	// catalogue, and a new league added in admin shows up on the next full page
	// load rather than needing a router.invalidate() to surface it.
	beforeLoad: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: LeaguesDocument,
			fetchPolicy: "cache-first",
		})
		return { leagues: data?.leagues ?? [] }
	},
})

function RouteComponent() {
	const { leagues } = Route.useRouteContext()
	return (
		<AppShell leagues={leagues}>
			<Outlet />
		</AppShell>
	)
}
