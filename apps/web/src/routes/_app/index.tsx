import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { GuestCalls } from "#/components/home/guest-calls"
import { GuestIntro } from "#/components/home/guest-intro"
import { HomeCallsStrip } from "#/components/home/home-calls-strip"
import { HomeEmptyFeed } from "#/components/home/home-empty-feed"
import { HomeRail } from "#/components/home/home-rail"
import { OnboardingChecklist } from "#/components/onboarding/onboarding-checklist"
import { TeamsPrompt } from "#/components/onboarding/teams-prompt"
import { PostFeed } from "#/components/posts/post-feed"
import { PageHeader } from "#/components/ui/page-header"
import { rankPuzzleTodayQuery } from "#/graphql/blind-rank/queries"
import { guestPicksQuery } from "#/graphql/guest-picks/queries"
import { homeDashboardQuery } from "#/graphql/home/queries"
import { myLiveCallsQuery } from "#/graphql/my-calls/queries"
import { homeFeedQuery, popularRushmoresQuery } from "#/graphql/posts/queries"
import { seasonPuzzleTodayQuery } from "#/graphql/season-puzzles/queries"
import { teammateChainTodayQuery } from "#/graphql/teammate-chain/queries"
import { useMe } from "#/hooks/use-me"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/")({
	component: RouteComponent,
	head: () =>
		pageMeta({
			title: "Called My Shot",
			description:
				"Daily sports puzzles and calls on real games, scored on private leaderboards with your group chat, your fantasy league, or your audience. Free, no money ever.",
			path: "/",
		}),
	// The viewer's own results beside the feed, xl up. Below that they live on
	// the profile's Calls tab rather than repeating here.
	staticData: { rightRail: <HomeRail /> },
	// The live row reads its own cache entry (it's shared with My Calls), so
	// it's handed the dashboard's copy rather than fetching after first paint
	// and pushing everything below it down.
	loader: async ({ context }) => {
		const { queryClient, me } = context
		const [feed] = await Promise.all([
			queryClient.infiniteQuery(homeFeedQuery()),
			me
				? queryClient.query(homeDashboardQuery).then((data) =>
						queryClient.setQueryData(myLiveCallsQuery().queryKey, {
							myLiveCalls: data.myLiveCalls,
						}),
					)
				: Promise.all([
						queryClient.query(guestPicksQuery),
						queryClient.query(seasonPuzzleTodayQuery),
						queryClient.query(rankPuzzleTodayQuery),
						queryClient.query(teammateChainTodayQuery),
					]),
		])
		// An empty feed shows popular Rushmores in its place.
		if (feed.pages[0]?.items.length === 0) {
			await queryClient.infiniteQuery(popularRushmoresQuery())
		}
	},
})

// Home is a feed: posts from the spaces and people the viewer follows and
// from their groups. Above it, a strip of the viewer's calls in play and
// questions about to lock, which is all of the calling side Home keeps.
//
// Signed out, it's the front door: an intro that pitches groups and today's
// puzzles, a game to call without an account, and every public post.
function RouteComponent() {
	const { leagues } = Route.useRouteContext()
	const me = useMe()

	return (
		<VStack gap="8" alignItems="stretch">
			{me ? (
				<>
					<PageHeader
						title="Home"
						subtitle="Posts from what you follow, and calls about to lock"
					/>

					{/* Render nothing for an account that has already done everything
					    on them, or dismissed them. */}
					<OnboardingChecklist />
					<TeamsPrompt />

					<HomeCallsStrip />
				</>
			) : (
				<>
					<GuestIntro />
					<GuestCalls />
				</>
			)}

			<PostFeed
				query={homeFeedQuery()}
				empty={<HomeEmptyFeed leagues={leagues} />}
			/>
		</VStack>
	)
}
