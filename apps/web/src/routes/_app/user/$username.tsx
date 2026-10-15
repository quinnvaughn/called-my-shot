import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FiUserX } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { PageBanner } from "#/components/images/page-banner"
import { ColdStreaksSection } from "#/components/profile/cold-streaks-section"
import { OpenPresserBanner } from "#/components/profile/open-presser-banner"
import { PointsBreakdownSection } from "#/components/profile/points-breakdown-section"
import { PressersSection } from "#/components/profile/pressers-section"
import { ProfileHeader } from "#/components/profile/profile-header"
import { ProfileLeagueTabs } from "#/components/profile/profile-league-tabs"
import { ProfileShareRow } from "#/components/profile/profile-share-row"
import { ResultsSection } from "#/components/profile/results-section"
import { StatGrid } from "#/components/profile/stat-grid"
import { StreaksSection } from "#/components/profile/streaks-section"
import { SweepsSection } from "#/components/profile/sweeps-section"
import { CallCard } from "#/components/questions/call-card"
import { EmptyState } from "#/components/ui/empty-state"
import { NotFound } from "#/components/ui/not-found"
import { SectionLabel } from "#/components/ui/section-label"
import {
	UserProfileDocument,
	UserRecordDocument,
} from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import { formatRecord } from "#/lib/game-status"
import { toIdentity } from "#/lib/identity"
import { pageMeta } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"
import { profileCardVersion, scopedLeague } from "#/lib/profile"
import { statGridItems } from "#/lib/stat-grid"

const MAX_LIVE_STREAKS = 3

const userProfileQuery = (username: string) =>
	gqlQueryOptions(UserProfileDocument, { username })

const userRecordQuery = (username: string, league: string | null) =>
	gqlQueryOptions(UserRecordDocument, { username, league })

export const Route = createFileRoute("/_app/user/$username")({
	component: RouteComponent,
	// ?league=nba scopes the stats, calendar, breakdown and streaks to one
	// league. A slug that names nothing this user has played falls back to
	// the whole career rather than erroring, same as the leaderboard's filter.
	validateSearch: z.object({
		league: z.string().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ league: search.league }),
	loader: async ({ context, params, deps }) => {
		const profile = await context.queryClient.query(
			userProfileQuery(params.username),
		)
		const league = scopedLeague(
			profile.userByUsername?.leagues ?? [],
			deps.league,
		)
		await context.queryClient.query(
			userRecordQuery(params.username, league?.league.slug ?? null),
		)
		return profile
	},
	// The og:image and the description stay career-wide whatever league is
	// selected: a pasted profile link is a claim about the whole person.
	head: ({ loaderData }) => {
		const user = loaderData?.userByUsername
		if (!user) return {}

		// careerStats is null until someone has made a call, and accuracy stays
		// null until one of those calls resolves - so a brand new profile falls
		// back to naming the person rather than previewing as a row of zeroes.
		const stats = user.careerStats
		const summary = stats
			? [
					`${stats.resolvedCallCount.toLocaleString()} ${pluralize(stats.resolvedCallCount, "resolved call")}`,
					stats.accuracy !== null
						? `${Math.round(stats.accuracy)}% accuracy`
						: null,
					`${stats.totalPoints.toLocaleString()} points`,
					stats.rank !== null ? `ranked #${stats.rank}` : null,
				]
					.filter((part) => part !== null)
					.join(" · ")
			: "No calls yet"
		const title = `${user.name} (@${user.username}) · Called My Shot`

		return pageMeta({
			title,
			description: `${user.name} on Called My Shot - ${summary}.`,
			path: `/user/${user.username}`,
			// No card until there's a call to draw - the share route 404s on an
			// empty profile, and an og:image that 404s previews worse than none.
			...(stats
				? {
						image: {
							// The proxy route ignores the param.
							path: `/share/users/${user.username}/card.png?v=${profileCardVersion(stats)}`,
							alt: title,
						},
					}
				: {}),
		})
	},
})

function RouteComponent() {
	const { username } = Route.useParams()
	const search = Route.useSearch()
	const { data } = useSuspenseQuery(userProfileQuery(username))
	const user = data.userByUsername
	const me = useMe()
	const scoped = scopedLeague(user?.leagues ?? [], search.league)
	const { data: recordData } = useSuspenseQuery(
		userRecordQuery(username, scoped?.league.slug ?? null),
	)
	const record = recordData.userByUsername?.record ?? null
	const wideRecord = recordData.userByUsername?.wideRecord ?? null

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
	const leagueId = scoped?.league.id ?? null
	const inScope = <T extends { league: { id: string } }>(rows: T[]) =>
		leagueId ? rows.filter((row) => row.league.id === leagueId) : rows

	// Only runs still going make the top of the profile.
	const liveStreaks = inScope(user.streaks)
		.filter((streak) => streak.currentLength > 0)
		.slice(0, MAX_LIVE_STREAKS)
	const coldStreaks = inScope(user.coldStreaks)
	const latestSweep = inScope(user.sweeps)[0]
	const stats = scoped ?? user.careerStats

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
				share={
					user.careerStats && (
						<ProfileShareRow
							userId={user.id}
							username={user.username}
							shareTitle={`${user.name} on Called My Shot`}
						/>
					)
				}
			/>
			{user.headToHeadWithViewer && (
				<p className={css({ fontSize: "sm", color: "secondary.default" })}>
					You're{" "}
					{formatRecord(
						user.headToHeadWithViewer.wins,
						user.headToHeadWithViewer.losses,
						user.headToHeadWithViewer.draws || null,
					)}{" "}
					against @{user.username} in challenges.
				</p>
			)}
			<OpenPresserBanner
				username={user.username}
				isOwn={isOwn}
				pressers={user.openPressers}
			/>
			<ProfileLeagueTabs username={user.username} leagues={user.leagues} />
			<StatGrid
				header={
					<SectionLabel>
						{scoped ? `${scoped.league.name} career` : "Career"}
					</SectionLabel>
				}
				items={statGridItems({
					rank: stats?.rank ?? null,
					totalPoints: stats?.totalPoints ?? 0,
					accuracy: stats?.accuracy ?? null,
					convictionEdge: stats?.convictionEdge ?? null,
					resolvedCallCount: stats?.resolvedCallCount ?? 0,
				})}
			/>
			{record && (
				<ResultsSection
					record={record}
					wideRecord={wideRecord}
					username={user.username}
					leagueId={leagueId}
					leagueSlug={scoped?.league.slug ?? null}
				/>
			)}
			{record && (
				<PointsBreakdownSection record={record} username={user.username} />
			)}
			{liveStreaks.length > 0 && (
				<VStack alignItems="stretch" gap="3">
					<SectionLabel>Hot streaks</SectionLabel>
					<StreaksSection
						username={user.username}
						streaks={liveStreaks}
						isOwn={isOwn}
						showLeague={!scoped}
						layout="grid"
					/>
				</VStack>
			)}
			{coldStreaks.length > 0 && (
				<VStack alignItems="stretch" gap="3">
					<SectionLabel>Cold streaks</SectionLabel>
					<ColdStreaksSection
						username={user.username}
						coldStreaks={coldStreaks}
						showLeague={!scoped}
					/>
				</VStack>
			)}
			{latestSweep && (
				<VStack alignItems="stretch" gap="3">
					<SectionLabel>Latest sweep</SectionLabel>
					<SweepsSection
						username={user.username}
						sweeps={[latestSweep]}
						showLeague={!scoped}
					/>
				</VStack>
			)}
			<PressersSection
				heading={<SectionLabel>Pressers</SectionLabel>}
				username={user.username}
				pressers={user.pressers}
				leagueId={leagueId}
			/>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Recent Calls</SectionLabel>
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
