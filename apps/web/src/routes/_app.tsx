import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AppShell } from "#/components/app-shell/app-shell"
import { myFollowsQuery } from "#/graphql/follows/queries"
import { sidebarGroupsQuery } from "#/graphql/groups/queries"
import { gqlQueryOptions } from "#/graphql/query-options"
import { LeaguesDocument } from "#/graphql/sports/catalog/queries"

// staleTime: Infinity because beforeLoad isn't staleTime-gated the way a
// loader is - without it every navigation inside the shell would refetch the
// rail before any page could start loading. The league list turns over about
// as often as the sport catalogue, so a league added in admin shows up on the
// next full page load rather than needing an invalidation to surface it.
const leaguesQuery = gqlQueryOptions(
	LeaguesDocument,
	{},
	{ staleTime: Number.POSITIVE_INFINITY },
)

export const Route = createFileRoute("/_app")({
	component: RouteComponent,
	// Powers the space rail's league tiles (see app-shell.tsx) - loaded
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
	beforeLoad: async ({ context }) => {
		const data = await context.queryClient.query(leaguesQuery)
		return { leagues: data.leagues }
	},
	// The signed-in space rail's group tiles and followed leagues, loaded with
	// the page rather than fetched by the rail after it renders. A loader, not
	// beforeLoad: it runs alongside the page's own loaders instead of holding
	// them up.
	loader: async ({ context }) => {
		if (!context.me) return
		await Promise.all([
			context.queryClient.query(sidebarGroupsQuery),
			context.queryClient.query(myFollowsQuery),
		])
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
