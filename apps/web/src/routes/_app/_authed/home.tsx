import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { HomeHotStreaksSection } from "#/components/home/home-hot-streaks-section"
import { HomeJustResolvedSection } from "#/components/home/home-just-resolved-section"
import { HomeRail } from "#/components/home/home-rail"
import { HomeResultsSection } from "#/components/home/home-results-section"
import { HomeSectionLabel } from "#/components/home/home-section-label"
import { LeagueRoomCard } from "#/components/home/league-room-card"
import { LiveCallsSection } from "#/components/my-calls/live-calls-section"
import { OnboardingChecklist } from "#/components/onboarding/onboarding-checklist"
import { TeamsPrompt } from "#/components/onboarding/teams-prompt"
import { StatGrid } from "#/components/profile/stat-grid"
import { QuestionCard } from "#/components/questions/question-card"
import { CardRail } from "#/components/ui/card-rail"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { homeDashboardQuery } from "#/graphql/home/queries"
import { myLiveCallsQuery } from "#/graphql/my-calls/queries"
import { orderLeaguesByActivity } from "#/lib/league-order"
import { statGridItems } from "#/lib/stat-grid"

export const Route = createFileRoute("/_app/_authed/home")({
	component: RouteComponent,
	// The viewer's own results, beside the list of what to do next. The shell
	// only shows the rail from xl up, so RouteComponent repeats both sections
	// inline below that.
	staticData: { rightRail: <HomeRail /> },
	// The live row reads its own cache entry (it's shared with My Calls), so
	// it's handed the dashboard's copy rather than fetching after first paint
	// and pushing everything below it down.
	loader: async ({ context }) => {
		const data = await context.queryClient.query(homeDashboardQuery)
		context.queryClient.setQueryData(myLiveCallsQuery().queryKey, {
			myLiveCalls: data.myLiveCalls,
		})
	},
})

// Deliberately ranks no questions and grows with nothing - no MOST_CALLED/NEW
// sort, no question list that scales with the catalogue. League cards are
// counts, busiest league first; the two lists below are bounded by a time
// horizon, not by how many questions exist (see HomeDashboardDocument). This
// is a checklist of what's actionable right now, not a feed - that lives in
// each league's Feed tab.
function RouteComponent() {
	const { data } = useSuspenseQuery(homeDashboardQuery)

	const leagues = orderLeaguesByActivity(data.leagues)
	const lockingSoon = data.questions.items
	const stats = data.me?.careerStats

	return (
		<VStack gap="8" alignItems="stretch">
			<PageHeader
				title="Home"
				subtitle="Where things are and what's about to lock"
			/>

			{/* Renders nothing for an account that has already done everything on
			    it, or dismissed it. This route's own comment calls itself a
			    checklist of what's actionable right now, which is the same job. */}
			<OnboardingChecklist />
			<TeamsPrompt />

			<StatGrid
				header={<HomeSectionLabel>Career</HomeSectionLabel>}
				items={statGridItems({
					rank: stats?.rank ?? null,
					totalPoints: stats?.totalPoints ?? 0,
					accuracy: stats?.accuracy ?? null,
					convictionEdge: stats?.convictionEdge ?? null,
					resolvedCallCount: stats?.resolvedCallCount ?? 0,
				})}
			/>

			{/* Above Leagues: when it renders at all, a game the viewer called is
			    on right now, which is the most time-sensitive thing on the page.
			    Main column only, since the row scrolls sideways and needs the
			    width. */}
			<LiveCallsSection filters={{}} />

			{/* A row rather than a stack: stacked, every league costs a full card
			    of scrolling before Locking soon. */}
			<CardRail
				items={leagues}
				getKey={(league) => league.id}
				renderItem={(league) => <LeagueRoomCard league={league} />}
				itemLabel="league"
				header={<HomeSectionLabel>Leagues</HomeSectionLabel>}
			/>

			{/* Above Locking soon, which runs six cards deep: the calendar is a
			    fixed height and the streaks a few short tiles, so they cost the
			    list little to sit over it. Same order as the rail. */}
			<VStack
				gap="8"
				alignItems="stretch"
				className={css({ display: { base: "flex", xl: "none" } })}
			>
				<HomeResultsSection placement="main" />
				<HomeHotStreaksSection />
			</VStack>

			<VStack gap="3" alignItems="stretch">
				<HomeSectionLabel>Locking soon</HomeSectionLabel>
				{lockingSoon.length > 0 ? (
					<VStack gap="3" alignItems="stretch">
						{lockingSoon.map((question) => (
							<QuestionCard key={question.id} question={question} />
						))}
					</VStack>
				) : (
					<EmptyState>
						Nothing locking soon. Open a league to find questions worth calling.
					</EmptyState>
				)}
			</VStack>

			<div className={css({ display: { base: "block", xl: "none" } })}>
				<HomeJustResolvedSection />
			</div>
		</VStack>
	)
}

