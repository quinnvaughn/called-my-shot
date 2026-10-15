import {
	STREAK_FAMILY_LABEL,
	type StreakFamily,
	type StreakMode,
} from "@called-my-shot/scoring"
import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { arrowLink } from "#/components/ui/arrow-link"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { userStreakPageQuery } from "#/graphql/streaks/queries"
import { useMe } from "#/hooks/use-me"
import {
	buildColdStreakTweet,
	buildStreakTweet,
	milestoneNudge,
	type StreakFamilyValue,
	streakFamilyParam,
} from "#/lib/streak-meta"
import { describeStreak } from "#/lib/streak-view"
import { RunSection } from "./run-section"
import { StreakRecordCard } from "./streak-record-card"
import { StreakShareRow } from "./streak-share-row"

export function StreakPage({
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
	const me = useMe()
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
				avatarUrl={user.avatarUrl}
				mode={view.mode}
				currentLength={streak.currentLength}
				bestLength={streak.bestLength}
				currentColdLength={streak.currentColdLength}
				worstColdLength={streak.worstColdLength}
				runStartedAt={view.runStartedAt}
				lastCall={view.lastCall}
				runPoints={view.runPoints}
				runBonus={view.runBonus}
				nextMilestone={view.nextMilestone}
				footer={
					<HStack justify="space-between" gap="3" width="full">
						<Link
							to="/user/$username"
							params={{ username: user.username }}
							className={arrowLink({ tone: "primary", align: "parent" })}
						>
							{isOwn ? "Your profile →" : `@${user.username}'s profile →`}
						</Link>
						<StreakShareRow
							layout="icons"
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
					</HStack>
				}
			/>

			{nudge && (
				<span
					className={css({
						textStyle: "label",
						color: "secondary.default",
					})}
				>
					{nudge}
				</span>
			)}

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
		</VStack>
	)
}
