import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { FiUserX } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { PageBanner } from "#/components/images/page-banner"
import { ColdStreaksSection } from "#/components/profile/cold-streaks-section"
import { LeagueAccordion } from "#/components/profile/league-accordion"
import { ProfileHeader } from "#/components/profile/profile-header"
import { ShareCardPreview } from "#/components/profile/share-card-preview"
import { ShareImagePanel } from "#/components/profile/share-image-panel"
import { StatGrid, statGridItems } from "#/components/profile/stat-grid"
import { StreaksSection } from "#/components/profile/streaks-section"
import { SweepsSection } from "#/components/profile/sweeps-section"
import { CallCard } from "#/components/questions/call-card"
import { EmptyState } from "#/components/ui/empty-state"
import { NotFound } from "#/components/ui/not-found"
import { UserProfileDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { toIdentity } from "#/lib/identity"
import { pageMeta } from "#/lib/meta"

const MAX_LIVE_STREAKS = 3

const userProfileQuery = (username: string) =>
	gqlQueryOptions(UserProfileDocument, { username })

export const Route = createFileRoute("/_app/user/$username")({
	component: RouteComponent,
	loader: ({ context, params }) =>
		context.queryClient.query(userProfileQuery(params.username)),
	// A profile link is one of the most pasted urls in the app (there is a
	// whole share-card flow built around it - see share-image-panel.tsx), and
	// without this every one of them previewed as the root route's generic
	// site copy, naming nobody.
	head: ({ loaderData }) => {
		const user = loaderData?.userByUsername
		if (!user) return {}

		// careerStats is null until someone has made a call, and accuracy stays
		// null until one of those calls resolves - so a brand new profile falls
		// back to naming the person rather than previewing as a row of zeroes.
		const stats = user.careerStats
		const summary = stats
			? [
					`${stats.resolvedCallCount.toLocaleString()} resolved call${stats.resolvedCallCount === 1 ? "" : "s"}`,
					stats.accuracy !== null
						? `${Math.round(stats.accuracy)}% accuracy`
						: null,
					`${stats.totalPoints.toLocaleString()} points`,
					stats.rank !== null ? `ranked #${stats.rank}` : null,
				]
					.filter((part) => part !== null)
					.join(" · ")
			: "No calls yet"

		return pageMeta({
			title: `${user.name} (@${user.username}) · Called My Shot`,
			description: `${user.name} on Called My Shot - ${summary}.`,
			path: `/user/${user.username}`,
		})
	},
})

function sectionLabel(text: string) {
	return (
		<h2
			className={css({
				fontFamily: "mono",
				fontSize: "xs",
				letterSpacing: "wide",
				color: "fg.muted",
				textTransform: "uppercase",
			})}
		>
			{text}
		</h2>
	)
}

function RouteComponent() {
	const { username } = Route.useParams()
	const { data } = useSuspenseQuery(userProfileQuery(username))
	const user = data.userByUsername
	const { me } = useRouteContext({ from: "__root__" })

	if (!user) {
		return (
			<NotFound
				icon={<FiUserX size="24" />}
				eyebrowText="Profile"
				heading="This user doesn't exist"
				subtitle="They may have changed their username, or the link's just wrong. Double check the URL."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	const isOwn = me?.id === user.id
	// Only runs still going make the top of the profile. Every track, ended
	// ones included, is listed in its league's accordion below.
	const liveStreaks = user.streaks
		.filter((streak) => streak.currentLength > 0)
		.slice(0, MAX_LIVE_STREAKS)
	const latestSweep = user.sweeps[0]

	return (
		<VStack alignItems="stretch" gap="6">
			<PageBanner
				bannerUrl={user.bannerUrl ?? null}
				edit={
					isOwn
						? { target: { kind: "user_banner" }, title: "Profile banner" }
						: null
				}
			/>
			<ProfileHeader
				user={{ ...user, flair: toIdentity(user).flair }}
				viewerId={me?.id}
			/>
			{sectionLabel("Career")}
			<StatGrid
				items={statGridItems({
					rank: user.careerStats?.rank ?? null,
					totalPoints: user.careerStats?.totalPoints ?? 0,
					accuracy: user.careerStats?.accuracy ?? null,
					convictionEdge: user.careerStats?.convictionEdge ?? null,
					resolvedCallCount: user.careerStats?.resolvedCallCount ?? 0,
				})}
			/>
			{user.careerStats && (
				<ShareImagePanel
					src={`/share/users/${user.username}`}
					filename={`${user.username}-career-stats.png`}
					label="Share my career stats"
					shareType="profile"
					renderPreview={(previewProps) => (
						<ShareCardPreview
							{...previewProps}
							data={{
								name: user.name,
								username: user.username,
								avatarUrl: user.avatarUrl,
								memberSince: user.createdAt,
								scopeTag: "All-time track record",
								rank: user.careerStats?.rank ?? null,
								totalPoints: user.careerStats?.totalPoints ?? 0,
								accuracy: user.careerStats?.accuracy ?? null,
								resolvedCallCount: user.careerStats?.resolvedCallCount ?? 0,
							}}
						/>
					)}
				/>
			)}
			{liveStreaks.length > 0 && (
				<VStack alignItems="stretch" gap="3">
					{sectionLabel("Hot streaks")}
					<StreaksSection
						username={user.username}
						streaks={liveStreaks}
						isOwn={isOwn}
						layout="grid"
					/>
				</VStack>
			)}
			{user.coldStreaks.length > 0 && (
				<VStack alignItems="stretch" gap="3">
					{sectionLabel("Cold streaks")}
					<ColdStreaksSection
						username={user.username}
						coldStreaks={user.coldStreaks}
					/>
				</VStack>
			)}
			{latestSweep && (
				<VStack alignItems="stretch" gap="3">
					{sectionLabel("Latest sweep")}
					<SweepsSection username={user.username} sweeps={[latestSweep]} />
				</VStack>
			)}
			{user.leagues.length > 0 && (
				<VStack alignItems="stretch" gap="3">
					{sectionLabel("Leagues")}
					<VStack alignItems="stretch" gap="3">
						{user.leagues.map((leagueStats) => (
							<LeagueAccordion
								key={leagueStats.league.id}
								stats={leagueStats}
								user={user}
								streaks={user.streaks.filter(
									(streak) => streak.league.id === leagueStats.league.id,
								)}
								coldStreaks={user.coldStreaks.filter(
									(streak) => streak.league.id === leagueStats.league.id,
								)}
								sweeps={user.sweeps.filter(
									(sweep) => sweep.league.id === leagueStats.league.id,
								)}
								isOwn={isOwn}
							/>
						))}
					</VStack>
				</VStack>
			)}
			<VStack alignItems="stretch" gap="3">
				{sectionLabel("Recent Calls")}
				{user.recentCalls.length > 0 ? (
					<VStack alignItems="stretch" gap="2">
						{user.recentCalls.map((call) => (
							<CallCard key={call.id} call={call} />
						))}
					</VStack>
				) : (
					<EmptyState>No calls yet.</EmptyState>
				)}
			</VStack>
		</VStack>
	)
}
