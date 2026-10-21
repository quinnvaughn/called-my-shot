import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { VStack } from "styled-system/jsx"
import { SiteLeaderboard } from "#/components/leaderboard/site-leaderboard"
import { PageHeader } from "#/components/ui/page-header"
import { useGqlMutation } from "#/graphql/hooks"
import {
	leaderboardPageQuery,
	leaderboardQuery,
} from "#/graphql/leaderboard/queries"
import { MarkLeaderboardViewedDocument } from "#/graphql/onboarding/mutations"
import { onboardingQuery } from "#/graphql/onboarding/queries"
import { seedInfiniteQuery } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import {
	leaderboardSearchSchema,
	resolveLeaderboardFilter,
} from "#/lib/leaderboard-filter"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/leaderboard")({
	component: RouteComponent,
	validateSearch: leaderboardSearchSchema,
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

// Which account this page load has already told the server about. Once per
// user per page load is enough, since the server only ever keeps the first
// visit, and keying on the id covers signing out and back in as someone else.
let markedViewedForUserId: string | null = null

function RouteComponent() {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const { leagues } = Route.useRouteContext()
	const me = useMe()
	const queryClient = useQueryClient()
	const { mutate: markViewed } = useGqlMutation(MarkLeaderboardViewedDocument)

	// Opening the leaderboard is what ticks "See where you rank" on the
	// get-started checklist, which reads it through ViewerOnboarding.
	useEffect(() => {
		if (!me || markedViewedForUserId === me.id) return
		markedViewedForUserId = me.id
		markViewed(undefined, {
			onSuccess: () =>
				queryClient.invalidateQueries({
					queryKey: onboardingQuery.queryKey,
				}),
		})
	}, [me, markViewed, queryClient])

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
				// A filter swaps the board in place, so the page stays where
				// the reader is rather than jumping back above the header.
				onFilterChange={(next) =>
					navigate({ search: next, resetScroll: false })
				}
				viewerId={me?.id}
			/>
		</VStack>
	)
}
