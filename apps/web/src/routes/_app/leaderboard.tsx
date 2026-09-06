import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { SiteLeaderboard } from "#/components/leaderboard/site-leaderboard"
import { PageHeader } from "#/components/ui/page-header"
import {
	leaderboardPageQuery,
	leaderboardQuery,
} from "#/graphql/queries/leaderboard"
import { seedInfiniteQuery } from "#/graphql/query-options"
import {
	resolveLeaderboardFilter,
	validateLeaderboardSearch,
} from "#/lib/leaderboard-filter"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/leaderboard")({
	component: RouteComponent,
	validateSearch: validateLeaderboardSearch,
	loaderDeps: ({ search }) => ({
		league: search.league,
		season: search.season,
	}),
	// The first page arrives under LeaderboardPageDocument's shape, not the
	// per-list one the infinite query paginates with, so it's handed to that
	// cache directly rather than costing a second request. Seeded for whatever
	// scope the URL asks for - a shared link to a filtered board loads that
	// board, not the default one.
	//
	// The leagues (and their seasons) come from _app's router context, which
	// is what turns the URL's slug/year into the ids this query takes - see
	// lib/leaderboard-filter.ts.
	loader: async ({ context, deps }) => {
		const filter = resolveLeaderboardFilter(context.leagues, deps)
		const data = await context.queryClient.query(
			leaderboardPageQuery(filter.leagueId, filter.season),
		)
		seedInfiniteQuery(
			context.queryClient,
			leaderboardQuery(filter.leagueId, filter.season),
			data,
		)
	},
	// No league/season in the title or the canonical url even though both are
	// in the search params - every filtered board is the same page with a
	// different scope selected, and pointing them all at the bare url is what
	// keeps them from competing with each other in search.
	head: () =>
		pageMeta({
			title: "Leaderboard · Called My Shot",
			description:
				"Who is actually calling their shots - ranked by points earned across every league, season and question shape.",
			path: "/leaderboard",
		}),
})

function RouteComponent() {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const { leagues } = Route.useRouteContext()
	const { me } = useRouteContext({ from: "__root__" })

	const filter = resolveLeaderboardFilter(leagues, search)

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Leaderboard"
				subtitle={`Ranked by total points. ${filter.scopeLabel}.`}
			/>
			<SiteLeaderboard
				leagues={leagues}
				filter={filter}
				onFilterChange={(next) => navigate({ search: next })}
				viewerId={me?.id}
			/>
		</VStack>
	)
}
