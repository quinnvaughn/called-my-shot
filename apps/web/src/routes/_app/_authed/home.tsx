import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { type ReactNode, useEffect } from "react"
import { css } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { LeagueRoomCard } from "#/components/home/league-room-card"
import { LiveCallsSection } from "#/components/my-calls/live-calls-section"
import { OnboardingChecklist } from "#/components/onboarding/onboarding-checklist"
import { ResultsCalendar } from "#/components/profile/results-calendar"
import { StatGrid, statGridItems } from "#/components/profile/stat-grid"
import { StreaksSection } from "#/components/profile/streaks-section"
import { QuestionCard } from "#/components/questions/question-card"
import { CardRail } from "#/components/ui/card-rail"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { HomeDashboardDocument } from "#/graphql/queries/home"
import { myLiveCallsQuery } from "#/graphql/queries/my-calls"
import { gqlQueryOptions } from "#/graphql/query-options"
import { submitGuestPicks } from "#/lib/submit-guest-picks"

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<h2
			className={css({
				fontFamily: "mono",
				fontSize: "2xs",
				letterSpacing: "wide",
				textTransform: "uppercase",
				color: "fg.muted",
			})}
		>
			{children}
		</h2>
	)
}

const homeDashboardQuery = gqlQueryOptions(HomeDashboardDocument, {})

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

// Deliberately ranks nothing and grows with nothing - no MOST_CALLED/NEW sort, no
// question list that scales with the catalogue. League cards are counts;
// the two lists below are bounded by a time horizon, not by how many
// questions exist (see HomeDashboardDocument). This is a checklist of what's
// actionable right now, not a feed - that lives in each league's Feed tab.
function RouteComponent() {
	const { data } = useSuspenseQuery(homeDashboardQuery)
	const queryClient = useQueryClient()
	const router = useRouter()

	// Every sign-up and sign-in lands here, so this is where picks made on the
	// landing page before the account existed get posted.
	useEffect(() => {
		void submitGuestPicks({ queryClient, router })
	}, [queryClient, router])

	const leagues = data.leagues
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

			<StatGrid
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

			{/* A row on phones rather than a stack: stacked, every league costs a
			    full card of scrolling before Locking soon. From sm up they fit
			    side by side as a grid. */}
			<div className={css({ display: { base: "block", sm: "none" } })}>
				<CardRail
					items={leagues}
					getKey={(league) => league.id}
					renderItem={(league) => <LeagueRoomCard league={league} />}
					itemLabel="league"
					header={<SectionLabel>Leagues</SectionLabel>}
				/>
			</div>
			<VStack
				gap="3"
				alignItems="stretch"
				className={css({ display: { base: "none", sm: "flex" } })}
			>
				<SectionLabel>Leagues</SectionLabel>
				<Grid gridTemplateColumns="repeat(3, 1fr)" gap="3">
					{leagues.map((league) => (
						<LeagueRoomCard key={league.id} league={league} />
					))}
				</Grid>
			</VStack>

			{/* Above Locking soon, which runs six cards deep: the calendar is a
			    fixed height and the streaks a few short tiles, so they cost the
			    list little to sit over it. Same order as the rail. */}
			<VStack
				gap="8"
				alignItems="stretch"
				className={css({ display: { base: "flex", xl: "none" } })}
			>
				<ResultsSection placement="main" />
				<HotStreaksSection />
			</VStack>

			<VStack gap="3" alignItems="stretch">
				<SectionLabel>Locking soon</SectionLabel>
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
				<JustResolvedSection />
			</div>
		</VStack>
	)
}

function HomeRail() {
	return (
		<VStack gap="8" alignItems="stretch">
			<ResultsSection placement="rail" />
			<HotStreaksSection />
			<JustResolvedSection />
		</VStack>
	)
}

function ResultsSection({ placement }: { placement: "main" | "rail" }) {
	const { data } = useSuspenseQuery(homeDashboardQuery)
	const me = data.me
	const record = me?.record
	if (!me || !record) {
		return null
	}
	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="space-between" alignItems="baseline" gap="3">
				<SectionLabel>Your results</SectionLabel>
				<Link
					to="/user/$username"
					params={{ username: me.username }}
					className={css({
						fontSize: "xs",
						color: "primary.default",
						whiteSpace: "nowrap",
						_hover: { textDecoration: "underline" },
					})}
				>
					Full record
				</Link>
			</HStack>
			<ResultsCalendar
				calendar={record.calendar}
				username={me.username}
				compact={placement === "rail"}
			/>
		</VStack>
	)
}

// Same cap as the profile's top row of live runs.
const MAX_LIVE_STREAKS = 3

// Live runs only. A run that has ended, or a cold one, gives the viewer
// nothing to act on from here; both stay on the profile.
function HotStreaksSection() {
	const { data } = useSuspenseQuery(homeDashboardQuery)
	const me = data.me
	const live = (me?.streaks ?? [])
		.filter((streak) => streak.currentLength > 0)
		.slice(0, MAX_LIVE_STREAKS)
	if (!me || live.length === 0) return null
	return (
		<VStack gap="3" alignItems="stretch">
			<SectionLabel>Hot streaks</SectionLabel>
			<StreaksSection
				username={me.username}
				streaks={live}
				isOwn
				layout="grid"
			/>
		</VStack>
	)
}

function JustResolvedSection() {
	const { data } = useSuspenseQuery(homeDashboardQuery)
	const justResolved = data.myRecentResolvedCalls
	return (
		<VStack gap="3" alignItems="stretch">
			<SectionLabel>Just resolved</SectionLabel>
			{justResolved.length > 0 ? (
				<VStack gap="3" alignItems="stretch">
					{justResolved.map(
						(call) =>
							call.question && (
								<QuestionCard key={call.id} question={call.question} />
							),
					)}
				</VStack>
			) : (
				<EmptyState>
					No results yet. Your calls will show up here as they resolve.
				</EmptyState>
			)}
		</VStack>
	)
}
