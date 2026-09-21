import {
	resolveStreakMode,
	STREAK_FAMILY_LABEL,
	type StreakFamily,
	type StreakMode,
} from "@called-my-shot/scoring"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { CallCard } from "#/components/questions/call-card"
import { StreakRecordCard } from "#/components/streaks/streak-record-card"
import { StreakShareRow } from "#/components/streaks/streak-share-row"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { CardRail } from "#/components/ui/card-rail"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import type { UserStreakPageQuery } from "#/graphql/generated/graphql"
import { userStreakPageQuery } from "#/graphql/queries/streaks"
import { formatCallDate } from "#/lib/format-date"
import { pageMeta } from "#/lib/meta"
import {
	buildColdStreakTweet,
	buildStreakTweet,
	coldCardVersion,
	coldStreakPageMeta,
	milestoneNudge,
	parseStreakFamilyParam,
	parseStreakMode,
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
//
// /hot and /cold are separate pages rather than one page that reads whichever
// side is live, because a single track can be worth linking to on both: a
// group's "best streaks" row and its "cold streaks" row can name the same
// track, since a best run of 6 says nothing about missing the last 4.
// Clicking the first should never land on the second. resolveStreakMode in
// the scoring package settles which side a request gets, and the card route
// reads the same segment so an unfurl can't disagree with the page.
export const Route = createFileRoute(
	"/_app/user/$username_/streaks/$league/$family/$mode",
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
	head: ({ loaderData, params }) => {
		const user = loaderData?.user
		const streak = user?.streak
		if (!user || !streak) return {}
		const view = describeStreak(streak, parseStreakMode(params.mode))
		if (!view) return {}

		const { title, description } =
			view.mode === "cold"
				? coldStreakPageMeta({
						username: user.username,
						track: view.track,
						currentColdLength: streak.currentColdLength,
						worstColdLength: streak.worstColdLength,
						startedAt: view.runStartedAt,
					})
				: streakPageMeta({
						username: user.username,
						track: view.track,
						currentLength: streak.currentLength,
						bestLength: streak.bestLength,
						runStartedAt: view.runStartedAt,
					})

		return pageMeta({
			title,
			description,
			path: streakPath(
				user.username,
				streak.league.slug,
				streak.family,
				view.mode,
			),
			image: {
				// Changes whenever a number on the card does, so an unfurl cache
				// holding an older card is handed a url it has never scraped. The
				// proxy route ignores the param. The two modes version separately,
				// so a track going cold re-scrapes instead of serving the run's
				// card back.
				path: `/share/streaks/${user.username}/${streak.league.slug}/${streakFamilyParam(streak.family)}/${view.mode}/card.png?v=${
					view.mode === "cold"
						? coldCardVersion({
								currentColdLength: streak.currentColdLength,
								worstColdLength: streak.worstColdLength,
								lastMissCallId: view.lastCall?.id ?? null,
							})
						: streakCardVersion({
								currentLength: streak.currentLength,
								bestLength: streak.bestLength,
								lastHitCallId: view.lastCall?.id ?? null,
							})
				}`,
				alt: title,
			},
		})
	},
})

// What the page, its meta and its og:image all lead with. The url's mode
// decides the side; within a side, the live run leads and the record one
// stands in once it has ended. Null when the track has nothing on either
// side, which is the page's not-found.
function describeStreak(streak: Streak, requested: StreakMode | null) {
	const mode = resolveStreakMode(streak, requested)
	if (!mode) return null
	const run =
		mode === "cold"
			? streak.currentColdLength > 0
				? streak.coldRunCalls
				: streak.worstColdRunCalls
			: streak.currentLength > 0
				? streak.currentRunCalls
				: streak.bestRunCalls
	const first = run[0]
	return {
		mode,
		track: `${streak.league.abbreviation.toUpperCase()} ${streak.familyLabel}`,
		runStartedAt: first ? formatCallDate(first.createdAt) : null,
		lastCall: run[run.length - 1] ?? null,
	}
}

function RouteComponent() {
	const {
		username,
		league,
		family: familyParam,
		mode: modeParam,
	} = Route.useParams()
	const family = parseStreakFamilyParam(familyParam)
	const mode = parseStreakMode(modeParam)

	if (!family || !mode) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Streak"
				heading="This streak doesn't exist"
				subtitle={
					family
						? "A streak link ends in /hot or /cold, and this one ends in neither."
						: "Streaks are tracked for winners, totals, props and number guesses, and this link names none of them."
				}
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	return (
		<StreakPage
			username={username}
			league={league}
			family={family}
			mode={mode}
		/>
	)
}

function StreakPage({
	username,
	league,
	family,
	mode,
}: {
	username: string
	league: string
	family: StreakFamilyValue
	mode: StreakMode
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

	// Same floor as the profile's lists and the og:image route: a run of one
	// call isn't a streak, on either side. describeStreak returns null when
	// neither side clears it.
	const view = streak ? describeStreak(streak, mode) : null
	if (!streak || !view) {
		const label = STREAK_FAMILY_LABEL[streakFamilyParam(family) as StreakFamily]
		const track = `${league.toUpperCase()} ${label}`
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Streak"
				heading="No streak here"
				subtitle={
					mode === "cold"
						? `@${user.username} hasn't missed 2 ${track} in a row yet.`
						: `@${user.username} hasn't called 2 ${track} in a row right yet.`
				}
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	const cold = view.mode === "cold"
	const isOwn = me?.id === user.id
	// Nothing to chase on a cold streak, so no nudge either.
	const nudge =
		isOwn && !cold
			? milestoneNudge(streak.currentLength, streak.nextMilestone)
			: null

	return (
		<VStack gap="6" alignItems="stretch">
			<Breadcrumb>
				<Breadcrumb.Link
					to="/user/$username"
					params={{ username: user.username }}
				>
					@{user.username}
				</Breadcrumb.Link>
				<Breadcrumb.Current>
					{view.track} {cold ? "cold streak" : "streak"}
				</Breadcrumb.Current>
			</Breadcrumb>

			<PageHeader
				title={`${view.track} ${cold ? "cold streak" : "streak"}`}
				subtitle={user.name}
			/>

			<StreakRecordCard
				leagueAbbr={streak.league.abbreviation.toUpperCase()}
				familyLabel={streak.familyLabel}
				name={user.name}
				username={user.username}
				mode={view.mode}
				currentLength={streak.currentLength}
				bestLength={streak.bestLength}
				currentColdLength={streak.currentColdLength}
				worstColdLength={streak.worstColdLength}
				runStartedAt={view.runStartedAt}
				lastCall={view.lastCall}
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
				mode={view.mode}
				shareTitle={`@${user.username}'s ${view.track} ${cold ? "cold streak" : "streak"}`}
				tweetText={
					cold
						? buildColdStreakTweet({
								track: view.track,
								currentColdLength: streak.currentColdLength,
								worstColdLength: streak.worstColdLength,
								...(isOwn
									? ({ isOwn: true } as const)
									: ({ isOwn: false, username: user.username } as const)),
							})
						: buildStreakTweet({
								track: view.track,
								currentLength: streak.currentLength,
								bestLength: streak.bestLength,
								...(isOwn
									? ({ isOwn: true } as const)
									: ({ isOwn: false, username: user.username } as const)),
							})
				}
			/>

			{cold ? (
				<>
					<RunSection heading="Cold streak" calls={streak.coldRunCalls} />
					{!streak.worstColdIsCurrent &&
						streak.worstColdRunCalls.length > 0 && (
							<RunSection
								heading="Worst run"
								calls={streak.worstColdRunCalls}
							/>
						)}
				</>
			) : (
				<>
					{streak.currentLength > 0 && (
						<RunSection heading="Current run" calls={streak.currentRunCalls} />
					)}
					{!streak.bestIsCurrent && streak.bestRunCalls.length > 0 && (
						<RunSection heading="Best run" calls={streak.bestRunCalls} />
					)}
				</>
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

// Newest first, so the call that last extended the run leads the row.
function RunSection({
	heading,
	calls,
}: {
	heading: string
	calls: Streak["currentRunCalls"]
}) {
	return (
		<CardRail
			items={[...calls].reverse()}
			getKey={(call) => call.id}
			renderItem={(call) => <CallCard call={call} />}
			itemLabel="call"
			header={
				<>
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
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
						})}
					>
						{calls.length} calls
					</span>
				</>
			}
		/>
	)
}
