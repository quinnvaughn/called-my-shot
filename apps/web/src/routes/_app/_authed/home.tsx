import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { HomeCallsStrip } from "#/components/home/home-calls-strip"
import { HomeEmptyFeed } from "#/components/home/home-empty-feed"
import { HomeRail } from "#/components/home/home-rail"
import { OnboardingChecklist } from "#/components/onboarding/onboarding-checklist"
import { TeamsPrompt } from "#/components/onboarding/teams-prompt"
import { PostFeed } from "#/components/posts/post-feed"
import { PageHeader } from "#/components/ui/page-header"
import { homeDashboardQuery } from "#/graphql/home/queries"
import { myLiveCallsQuery } from "#/graphql/my-calls/queries"
import { homeFeedQuery, popularRushmoresQuery } from "#/graphql/posts/queries"

export const Route = createFileRoute("/_app/_authed/home")({
	component: RouteComponent,
	// The viewer's own results beside the feed, xl up. Below that they live on
	// the profile's Calls tab rather than repeating here.
	staticData: { rightRail: <HomeRail /> },
	// The live row reads its own cache entry (it's shared with My Calls), so
	// it's handed the dashboard's copy rather than fetching after first paint
	// and pushing everything below it down.
	loader: async ({ context }) => {
		const [data, feed] = await Promise.all([
			context.queryClient.query(homeDashboardQuery),
			context.queryClient.infiniteQuery(homeFeedQuery()),
		])
		context.queryClient.setQueryData(myLiveCallsQuery().queryKey, {
			myLiveCalls: data.myLiveCalls,
		})
		// An empty feed shows popular Rushmores in its place.
		if (feed.pages[0]?.items.length === 0) {
			await context.queryClient.infiniteQuery(popularRushmoresQuery())
		}
	},
})

// Home is a feed: posts from the spaces and people the viewer follows and
// from their groups. Above it, a strip of the viewer's calls in play and
// questions about to lock, which is all of the calling side Home keeps.
function RouteComponent() {
	const { leagues } = Route.useRouteContext()

	return (
		<VStack gap="8" alignItems="stretch">
			<PageHeader
				title="Home"
				subtitle="Posts from what you follow, and calls about to lock"
			/>

			{/* Render nothing for an account that has already done everything
			    on them, or dismissed them. */}
			<OnboardingChecklist />
			<TeamsPrompt />

			<HomeCallsStrip />

			<PostFeed
				query={homeFeedQuery()}
				empty={<HomeEmptyFeed leagues={leagues} />}
			/>
		</VStack>
	)
}
