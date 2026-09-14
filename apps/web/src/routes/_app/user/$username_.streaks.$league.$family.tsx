import { STREAK_FAMILY_LABEL, type StreakFamily } from "@called-my-shot/scoring"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { CallCard } from "#/components/questions/call-card"
import { StreakRecordCard } from "#/components/streaks/streak-record-card"
import { StreakShareRow } from "#/components/streaks/streak-share-row"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import type { UserStreakPageQuery } from "#/graphql/generated/graphql"
import { userStreakPageQuery } from "#/graphql/queries/streaks"
import { formatCallDate } from "#/lib/format-date"
import { pageMeta } from "#/lib/meta"
import {
	buildStreakTweet,
	milestoneNudge,
	parseStreakFamilyParam,
	type StreakFamilyValue,
	streakCardVersion,
	streakFamilyParam,
	streakPageMeta,
	streakPath,
} from "#/lib/streak-meta"

type Streak = NonNullable<
	NonNullable<UserStreakPageQuery["userByUsername"]>["streak"]
>

// Public, like /calls/:id - this url exists to be pasted somewhere. Not a
// child of /user/$username (that page has no outlet), hence the trailing
// underscore. Left out of the sitemap for the same reason calls are.
export const Route = createFileRoute(
	"/_app/user/$username_/streaks/$league/$family",
)({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const family = parseStreakFamilyParam(params.family)
		if (!family) return { user: null }
		const data = await context.queryClient.query(
			userStreakPageQuery(params.username, params.league, family),
		)
		return { user: data.userByUsername ?? null }
	},
	head: ({ loaderData }) => {
		const user = loaderData?.user
		const streak = user?.streak
		if (!user || !streak || streak.bestLength < 2) return {}

		const view = describeStreak(streak)
		const { title, description } = streakPageMeta({
			username: user.username,
			track: view.track,
			currentLength: streak.currentLength,
			bestLength: streak.bestLength,
			runStartedAt: view.runStartedAt,
		})

		return pageMeta({
			title,
			description,
			path: streakPath(user.username, streak.league.slug, streak.family),
			image: {
				// Changes whenever a number on the card does, so an unfurl cache
				// holding an older card is handed a url it has never scraped. The
				// proxy route ignores the param.
				path: `/share/streaks/${user.username}/${streak.league.slug}/${streakFamilyParam(streak.family)}/card.png?v=${streakCardVersion(
					{
						currentLength: streak.currentLength,
						bestLength: streak.bestLength,
						lastHitCallId: view.lastHit?.id ?? null,
					},
				)}`,
				alt: title,
			},
		})
	},
})

// What the page, its meta and its og:image all lead with: the current run
// while it's going, the best run once it isn't.
function describeStreak(streak: Streak) {
	const run =
		streak.currentLength > 0 ? streak.currentRunCalls : streak.bestRunCalls
	const first = run[0]
	return {
		track: `${streak.league.abbreviation.toUpperCase()} ${streak.familyLabel}`,
		runStartedAt: first ? formatCallDate(first.createdAt) : null,
		lastHit: run[run.length - 1] ?? null,
	}
}

function RouteComponent() {
	const { username, league, family: familyParam } = Route.useParams()
	const family = parseStreakFamilyParam(familyParam)

	if (!family) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Streak"
				heading="This streak doesn't exist"
				subtitle="Streaks are tracked for winners, totals, props and number guesses, and this link names none of them."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	return <StreakPage username={username} league={league} family={family} />
}

function StreakPage({
	username,
	league,
	family,
}: {
	username: string
	league: string
	family: StreakFamilyValue
}) {
	const { data } = useSuspenseQuery(
		userStreakPageQuery(username, league, family),
	)
	const { me } = useRouteContext({ from: "__root__" })
	const user = data.userByUsername
	const streak = user?.streak

	if (!user) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Streak"
				heading="This user doesn't exist"
				subtitle="They may have changed their username, or the link's just wrong."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	// Same floor as the profile's streak list and the og:image route: a best
	// run of one call isn't a streak.
	if (!streak || streak.bestLength < 2) {
		const label = STREAK_FAMILY_LABEL[streakFamilyParam(family) as StreakFamily]
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Streak"
				heading="No streak here"
				subtitle={`@${user.username} hasn't called 2 ${league.toUpperCase()} ${label} in a row right yet.`}
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	const view = describeStreak(streak)
	const isOwn = me?.id === user.id
	const nudge = isOwn
		? milestoneNudge(streak.currentLength, streak.nextMilestone)
		: null

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Breadcrumb>
				<Breadcrumb.Link
					to="/user/$username"
					params={{ username: user.username }}
				>
					@{user.username}
				</Breadcrumb.Link>
				<Breadcrumb.Current>{view.track} streak</Breadcrumb.Current>
			</Breadcrumb>

			<PageHeader title={`${view.track} streak`} subtitle={user.name} />

			<StreakRecordCard
				leagueAbbr={streak.league.abbreviation.toUpperCase()}
				familyLabel={streak.familyLabel}
				name={user.name}
				username={user.username}
				currentLength={streak.currentLength}
				bestLength={streak.bestLength}
				runStartedAt={view.runStartedAt}
				lastHit={view.lastHit}
			/>

			{nudge && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "success.default",
					})}
				>
					{nudge}
				</span>
			)}

			<StreakShareRow
				userId={user.id}
				username={user.username}
				leagueSlug={streak.league.slug}
				family={streak.family}
				shareTitle={`@${user.username}'s ${view.track} streak`}
				tweetText={buildStreakTweet({
					track: view.track,
					currentLength: streak.currentLength,
					bestLength: streak.bestLength,
					...(isOwn
						? ({ isOwn: true } as const)
						: ({ isOwn: false, username: user.username } as const)),
				})}
			/>

			{streak.currentLength > 0 && (
				<RunSection heading="Current run" calls={streak.currentRunCalls} />
			)}
			{!streak.bestIsCurrent && streak.bestRunCalls.length > 0 && (
				<RunSection heading="Best run" calls={streak.bestRunCalls} />
			)}

			<Link
				to="/user/$username"
				params={{ username: user.username }}
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "primary.default",
					textDecoration: "none",
					_hover: { opacity: 0.8 },
				})}
			>
				{isOwn ? "Back to your profile →" : `See @${user.username}'s profile →`}
			</Link>
		</VStack>
	)
}

// Newest first, so the call that last extended the run is on top.
function RunSection({
	heading,
	calls,
}: {
	heading: string
	calls: Streak["currentRunCalls"]
}) {
	return (
		<VStack gap="3" alignItems="stretch">
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					textTransform: "uppercase",
				})}
			>
				{heading}
			</span>
			<VStack gap="2" alignItems="stretch">
				{[...calls].reverse().map((call) => (
					<CallCard key={call.id} call={call} />
				))}
			</VStack>
		</VStack>
	)
}
