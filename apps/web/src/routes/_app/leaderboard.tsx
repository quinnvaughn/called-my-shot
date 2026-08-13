import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { SiteLeaderboard } from "#/components/leaderboard/site-leaderboard"
import { PageHeader } from "#/components/ui/page-header"
import { LeaderboardPageDocument } from "#/graphql/queries/leaderboard"

export const Route = createFileRoute("/_app/leaderboard")({
	component: RouteComponent,
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: LeaderboardPageDocument,
		})
		return {
			leagues: data?.leagues ?? [],
			items: data?.leaderboard.items ?? [],
			pageInfo: data?.leaderboard.pageInfo ?? {
				hasNextPage: false,
				endCursor: null,
			},
			viewerEntry: data?.viewerLeaderboardEntry ?? null,
		}
	},
})

function RouteComponent() {
	const { leagues, items, pageInfo, viewerEntry } = Route.useLoaderData()
	const { me } = useRouteContext({ from: "__root__" })

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Leaderboard"
				subtitle="Ranked by total points, across every league."
			/>
			<SiteLeaderboard
				leagues={leagues}
				initialItems={items}
				initialPageInfo={pageInfo}
				initialViewerEntry={viewerEntry}
				viewerId={me?.id}
			/>
		</VStack>
	)
}
