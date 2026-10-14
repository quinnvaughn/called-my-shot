import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { FiUserX } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { PageBanner } from "#/components/images/page-banner"
import { ColdStreaksSection } from "#/components/profile/cold-streaks-section"
import {
	PointsBreakdown,
	type PointsGroup,
	type PointsRow,
	type PointsView,
} from "#/components/profile/points-breakdown"
import {
	OpenPresserBanner,
	PressersSection,
} from "#/components/profile/pressers"
import { ProfileHeader } from "#/components/profile/profile-header"
import { ProfileShareRow } from "#/components/profile/profile-share-row"
import { ResultsCalendar } from "#/components/profile/results-calendar"
import { StatGrid, statGridItems } from "#/components/profile/stat-grid"
import { StreaksSection } from "#/components/profile/streaks-section"
import { SweepsSection } from "#/components/profile/sweeps-section"
import { CallCard } from "#/components/questions/call-card"
import { EmptyState } from "#/components/ui/empty-state"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import { TeamBadge } from "#/components/ui/team-badge"
import {
	UserProfileDocument,
	UserRecordDocument,
	type UserRecordQuery,
} from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { recordLine } from "#/lib/challenge"
import { toIdentity } from "#/lib/identity"
import { pageMeta } from "#/lib/meta"
import { profileCardVersion } from "#/lib/profile"

const MAX_LIVE_STREAKS = 3
// The best and worst teams the team view keeps on screen before the rest fold.
const TEAM_ROWS_AT_EACH_END = 3

type ProfileSearch = { league?: string }

const userProfileQuery = (username: string) =>
	gqlQueryOptions(UserProfileDocument, { username })

const userRecordQuery = (username: string, league: string | null) =>
	gqlQueryOptions(UserRecordDocument, { username, league })

export const Route = createFileRoute("/_app/user/$username")({
	component: RouteComponent,
	// ?league=nba scopes the stats, calendar, breakdown and streaks to one
	// league. A slug that names nothing this user has played falls back to
	// the whole career rather than erroring, same as the leaderboard's filter.
	validateSearch: (search: Record<string, unknown>): ProfileSearch => ({
		league: typeof search.league === "string" ? search.league : undefined,
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

type LeagueStats = {
	league: { id: string; name: string; abbreviation: string; slug: string }
}

function scopedLeague<T extends LeagueStats>(
	leagues: T[],
	slug: string | undefined,
): T | null {
	return slug ? (leagues.find((row) => row.league.slug === slug) ?? null) : null
}

type ProfileRecord = NonNullable<
	NonNullable<UserRecordQuery["userByUsername"]>["record"]
>

// Leagues (career view only), then play-type families with their shapes
// nested or teams, one at a time, then the bonuses no call earned. The league
// rows, the family rows and the team rows each add up to the calls' net, and
// any of them plus the bonuses is the points tile above them.
function breakdownGroups(record: ProfileRecord): PointsGroup[] {
	const groups: PointsGroup[] = []
	if (record.byLeague.length > 0) {
		groups.push({
			views: [
				{
					label: "By league",
					rows: record.byLeague.map((row) => ({
						key: row.league.id,
						label: row.league.name,
						netPoints: row.netPoints,
						wins: row.wins,
						losses: row.losses,
						returnPct: row.returnPct ?? null,
						leagueSlug: row.league.slug,
					})),
				},
			],
		})
	}
	const families: PointsRow[] = record.byFamily.map((family) => ({
		key: family.family,
		label: family.label,
		netPoints: family.netPoints,
		wins: family.wins,
		losses: family.losses,
		returnPct: family.returnPct ?? null,
		children: record.byShape
			.filter((shape) => shape.family === family.family)
			.map((shape) => ({
				key: shape.shape,
				label: shape.label,
				netPoints: shape.netPoints,
				wins: shape.wins,
				losses: shape.losses,
				returnPct: shape.returnPct ?? null,
			})),
	}))
	const teamRows: PointsRow[] = record.byTeam.map((row) => ({
		key: row.team?.id ?? "no-team",
		label: row.team?.name ?? "No specific team",
		icon: row.team && (
			<TeamBadge
				abbreviation={row.team.abbreviation}
				color={row.team.color}
				logoUrl={row.team.logoUrl}
			/>
		),
		netPoints: row.netPoints,
		wins: row.wins,
		losses: row.losses,
		returnPct: row.returnPct ?? null,
	}))
	// The API sorts the no-team row last, outside the best-to-worst order.
	const teams = teamRows.filter((row) => row.key !== "no-team")
	const noTeam = teamRows.filter((row) => row.key === "no-team")
	const splits: PointsView[] = [
		...(families.length > 0 ? [{ label: "By play type", rows: families }] : []),
		...(teamRows.length > 0
			? [
					{
						label: "By team",
						rows: teams,
						fold: { ends: TEAM_ROWS_AT_EACH_END, label: "Show all teams" },
						pinned: noTeam,
					},
				]
			: []),
	]
	if (splits.length > 0) groups.push({ views: splits })
	if (record.bonusPoints !== 0) {
		groups.push({
			views: [
				{
					label: "Bonuses",
					cardScale: true,
					rows: [
						{
							key: "bonuses",
							label: "Streaks & sweeps",
							netPoints: record.bonusPoints,
							wins: null,
							losses: null,
							returnPct: null,
						},
					],
				},
			],
		})
	}
	return groups
}

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
	const search = Route.useSearch()
	const { data } = useSuspenseQuery(userProfileQuery(username))
	const user = data.userByUsername
	const { me } = useRouteContext({ from: "__root__" })
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

	const breakdown = record ? breakdownGroups(record) : []

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
					You're {recordLine(user.headToHeadWithViewer)} against @
					{user.username} in challenges.
				</p>
			)}
			<OpenPresserBanner
				username={user.username}
				isOwn={isOwn}
				pressers={user.openPressers}
			/>
			{/* One tab per league played, plus All. A single league skips the
			    row entirely, since All and that league would be the same page. */}
			{user.leagues.length > 1 && (
				<Tabs.List>
					<Tabs.LinkTrigger
						to="/user/$username"
						params={{ username: user.username }}
						search={{ league: undefined }}
						// Without explicitUndefined, All's empty search would match
						// every league's url too and stay lit alongside it.
						activeOptions={{ includeSearch: true, explicitUndefined: true }}
					>
						All
					</Tabs.LinkTrigger>
					{user.leagues.map((row) => (
						<Tabs.LinkTrigger
							key={row.league.id}
							to="/user/$username"
							params={{ username: user.username }}
							search={{ league: row.league.slug }}
							activeOptions={{ includeSearch: true }}
						>
							{row.league.abbreviation}
						</Tabs.LinkTrigger>
					))}
				</Tabs.List>
			)}
			<StatGrid
				header={sectionLabel(scoped ? `${scoped.league.name} career` : "Career")}
				items={statGridItems({
					rank: stats?.rank ?? null,
					totalPoints: stats?.totalPoints ?? 0,
					accuracy: stats?.accuracy ?? null,
					convictionEdge: stats?.convictionEdge ?? null,
					resolvedCallCount: stats?.resolvedCallCount ?? 0,
				})}
			/>
			{record && (
				<VStack alignItems="stretch" gap="3">
					{sectionLabel("Results")}
					{/* Eight weeks below lg, half a year from it (see
					    UserRecordDocument). Each is remounted per scope so its
					    picked day and page reset to that scope's latest. */}
					<div className={css({ display: { base: "block", lg: "none" } })}>
						<ResultsCalendar
							key={leagueId ?? "all"}
							calendar={record.calendar}
							username={user.username}
							league={scoped?.league.slug ?? null}
						/>
					</div>
					{wideRecord && (
						<div className={css({ display: { base: "none", lg: "block" } })}>
							<ResultsCalendar
								key={leagueId ?? "all"}
								calendar={wideRecord.calendar}
								username={user.username}
								league={scoped?.league.slug ?? null}
							/>
						</div>
					)}
				</VStack>
			)}
			{breakdown.length > 0 && (
				<VStack alignItems="stretch" gap="3">
					{sectionLabel("Where the points come from")}
					<PointsBreakdown groups={breakdown} username={user.username} />
				</VStack>
			)}
			{liveStreaks.length > 0 && (
				<VStack alignItems="stretch" gap="3">
					{sectionLabel("Hot streaks")}
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
					{sectionLabel("Cold streaks")}
					<ColdStreaksSection
						username={user.username}
						coldStreaks={coldStreaks}
						showLeague={!scoped}
					/>
				</VStack>
			)}
			{latestSweep && (
				<VStack alignItems="stretch" gap="3">
					{sectionLabel("Latest sweep")}
					<SweepsSection
						username={user.username}
						sweeps={[latestSweep]}
						showLeague={!scoped}
					/>
				</VStack>
			)}
			<PressersSection
				heading={sectionLabel("Pressers")}
				username={user.username}
				pressers={user.pressers}
				leagueId={leagueId}
			/>
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
