import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { HomeFeed } from "#/components/home/home-feed"
import { PageHeader } from "#/components/ui/page-header"
import { HomePageDocument } from "#/graphql/queries/home"
import { timed } from "#/lib/server-timing"

export const Route = createFileRoute("/_app/_authed/home")({
	component: RouteComponent,
	loader: async ({ context }) => {
		const { data } = await timed("home-query", "HomePage query (loader)", () =>
			context.apolloClient.query({ query: HomePageDocument }),
		)
		return {
			leagues: data?.leagues ?? [],
			items: data?.questions.items ?? [],
			pageInfo: data?.questions.pageInfo ?? {
				hasNextPage: false,
				endCursor: null,
			},
		}
	},
})

function RouteComponent() {
	const { leagues, items, pageInfo } = Route.useLoaderData()

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Home"
				subtitle="What the field is calling right now."
			/>
			<HomeFeed
				leagues={leagues}
				initialItems={items}
				initialPageInfo={pageInfo}
			/>
		</VStack>
	)
}
