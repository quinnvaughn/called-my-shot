import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FiUserX } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { PageBanner } from "#/components/images/page-banner"
import { PostFeed } from "#/components/posts/post-feed"
import { OpenPresserBanner } from "#/components/profile/open-presser-banner"
import { ProfileCallsTab } from "#/components/profile/profile-calls-tab"
import { ProfileHeader } from "#/components/profile/profile-header"
import { ProfileShareRow } from "#/components/profile/profile-share-row"
import { EmptyState } from "#/components/ui/empty-state"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import { homeDashboardQuery } from "#/graphql/home/queries"
import { userPostsQuery } from "#/graphql/posts/queries"
import {
	userProfileQuery,
	userRecordQuery,
} from "#/graphql/user/profile/queries"
import { useMe } from "#/hooks/use-me"
import { formatRecord } from "#/lib/game-status"
import { toIdentity } from "#/lib/identity"
import { pageMeta } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"
import { profileCardVersion, scopedLeague } from "#/lib/profile"

type ProfileTab = "posts" | "calls"

// A league filter only means something on Calls, so a link that carries one
// (a points breakdown row) lands there without naming the tab.
function profileTab(search: { tab?: ProfileTab; league?: string }): ProfileTab {
	return search.tab ?? (search.league ? "calls" : "posts")
}

export const Route = createFileRoute("/_app/user/$username")({
	component: RouteComponent,
	// ?tab=calls opens the record; Posts is the default. ?league=nba scopes
	// the Calls tab's stats, calendar, breakdown and streaks to one league. A
	// slug that names nothing this user has played falls back to the whole
	// career rather than erroring, same as the leaderboard's filter.
	validateSearch: z.object({
		tab: z.enum(["posts", "calls"]).optional().catch(undefined),
		league: z.string().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({
		tab: profileTab(search),
		league: search.league,
	}),
	loader: async ({ context, params, deps }) => {
		const profile = await context.queryClient.query(
			userProfileQuery(params.username),
		)
		if (deps.tab === "posts") {
			await context.queryClient.infiniteQuery(userPostsQuery(params.username))
			return profile
		}
		const league = scopedLeague(
			profile.userByUsername?.leagues ?? [],
			deps.league,
		)
		const isOwn = !!context.me && context.me.id === profile.userByUsername?.id
		await Promise.all([
			context.queryClient.query(
				userRecordQuery(params.username, league?.league.slug ?? null),
			),
			// The league cards that lead the owner's own Calls tab.
			isOwn ? context.queryClient.query(homeDashboardQuery) : null,
		])
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
	const navigate = Route.useNavigate()
	const { data } = useSuspenseQuery(userProfileQuery(username))
	const user = data.userByUsername
	const me = useMe()
	const tab = profileTab(search)

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

	function selectTab(next: ProfileTab) {
		navigate({
			search: next === "calls" ? { tab: "calls" } : {},
			replace: true,
			resetScroll: false,
		})
	}

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
			<Tabs value={tab} onValueChange={selectTab}>
				<Tabs.List>
					<Tabs.Trigger value="posts">Posts</Tabs.Trigger>
					<Tabs.Trigger value="calls">Calls</Tabs.Trigger>
				</Tabs.List>
			</Tabs>
			{tab === "posts" ? (
				<PostFeed
					query={userPostsQuery(user.username)}
					empty={
						<EmptyState>
							{isOwn
								? "You haven't posted yet. Tap Create to make a Mount Rushmore. Posts you share with a group stay in that group."
								: `@${user.username} hasn't posted anything public yet.`}
						</EmptyState>
					}
				/>
			) : (
				<ProfileCallsTab user={user} leagueSlug={search.league} isOwn={isOwn} />
			)}
		</VStack>
	)
}
