import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { SiteLeaderboard } from "#/components/leaderboard/site-leaderboard"
import { PageHeader } from "#/components/ui/page-header"
import {
	leaderboardPageQuery,
	leaderboardQuery,
} from "#/graphql/queries/leaderboard"
import { seedInfiniteQuery } from "#/graphql/query-options"

export const Route = createFileRoute("/_app/leaderboard")({
	component: RouteComponent,
	// The leagues list and the first page arrive together (see
	// LeaderboardPageDocument), so that page is handed to the infinite cache
	// the list paginates with - seeded for the "All" league only, since
	// picking a league is a different key and fetches on its own.
	loader: async ({ context }) => {
		const data = await context.queryClient.query(leaderboardPageQuery)
		seedInfiniteQuery(context.queryClient, leaderboardQuery(null), {
			leaderboard: data.leaderboard,
			viewerLeaderboardEntry: data.viewerLeaderboardEntry,
		})
	},
})

function RouteComponent() {
	const { data } = useSuspenseQuery(leaderboardPageQuery)
	const { me } = useRouteContext({ from: "__root__" })

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Leaderboard"
				subtitle="Ranked by total points, across every league."
			/>
			<SiteLeaderboard leagues={data.leagues} viewerId={me?.id} />
		</VStack>
	)
}
