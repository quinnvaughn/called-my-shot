import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { FiSettings, FiUserPlus, FiUsers } from "react-icons/fi"
import { HiMiniQuestionMarkCircle } from "react-icons/hi2"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import {
	AnsweredQuestionsTab,
	answeredQuestionsQuery,
} from "#/components/groups/answered-questions-tab"
import {
	CreatedQuestionsTab,
	createdQuestionsQuery,
} from "#/components/groups/created-questions-tab"
import { GroupHeader } from "#/components/groups/group-header"
import {
	GroupHighlights,
	GroupHighlightsRail,
} from "#/components/groups/group-highlights"
import { GroupInviteCard } from "#/components/groups/group-invite-card"
import {
	GroupLeaderboard,
	groupLeaderboardQuery,
} from "#/components/groups/group-leaderboard"
import { GroupMembersSheet } from "#/components/groups/group-members-sheet"
import { GroupPinnedStrip } from "#/components/groups/group-pinned-strip"
import { GroupWelcomeModal } from "#/components/groups/group-welcome-modal"
import { InviteCodeModal } from "#/components/groups/invite-code-modal"
import {
	SharedQuestionsTab,
	sharedQuestionsQuery,
} from "#/components/groups/shared-questions-tab"
import { PageBanner } from "#/components/images/page-banner"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Button, type ButtonVariantProps } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import {
	GroupDetailDocument,
	GroupLeaguesDocument,
	type SeasonFilterInput,
} from "#/graphql/generated/graphql"
import { gqlQueryOptions, seedInfiniteQuery } from "#/graphql/query-options"
import {
	type FilterLeague,
	resolveLeaderboardFilter,
	validateLeaderboardSearch,
} from "#/lib/leaderboard-filter"
import { pluralize } from "#/lib/pluralize"
import { openModal } from "#/stores/modal-store"

const groupDetailQuery = (
	groupId: string,
	leagueId: string | null,
	season: SeasonFilterInput,
) => gqlQueryOptions(GroupDetailDocument, { groupId, leagueId, season })

const groupLeaguesQuery = (groupId: string) =>
	gqlQueryOptions(GroupLeaguesDocument, { groupId })

// The site's leagues narrowed to the ones this group tracks, and what the
// leaderboard's All tab should call that set. A group tracking every league
// (no tracked rows) keeps the full list and the default label.
function groupLeagueScope(
	leagues: FilterLeague[],
	tracked: { id: string; abbreviation: string }[],
): { leagues: FilterLeague[]; allLeaguesLabel?: string } {
	if (tracked.length === 0) return { leagues }
	const trackedIds = new Set(tracked.map((l) => l.id))
	return {
		leagues: leagues.filter((l) => trackedIds.has(l.id)),
		allLeaguesLabel: new Intl.ListFormat("en", {
			type: "conjunction",
		}).format(tracked.map((l) => l.abbreviation)),
	}
}

export const Route = createFileRoute("/_app/_authed/groups/$groupId/")({
	component: RouteComponent,
	staticData: { rightRail: <GroupRail /> },
	validateSearch: validateLeaderboardSearch,
	loaderDeps: ({ search }) => ({
		league: search.league,
		season: search.season,
	}),
	// Every list on this page gets its first page as an aliased field of one
	// query (see GroupDetailDocument), so those pages are handed to the
	// infinite caches the lists paginate with rather than costing a request
	// each. The leaderboard is seeded for whatever scope the URL asks for, so
	// a shared link to a filtered board loads that board directly; the leagues
	// (and their seasons) that turn the URL's slug/year into ids come from
	// _app's router context, narrowed to the ones this group tracks - see
	// lib/leaderboard-filter.ts.
	loader: async ({ context, params, deps }) => {
		const { groupId } = params
		const tracked = await context.queryClient.query(groupLeaguesQuery(groupId))
		const scope = groupLeagueScope(
			context.leagues,
			tracked.group?.trackedLeagues ?? [],
		)
		const filter = resolveLeaderboardFilter(scope.leagues, deps, {
			allLeaguesLabel: scope.allLeaguesLabel,
		})
		const data = await context.queryClient.query(
			groupDetailQuery(groupId, filter.leagueId, filter.season),
		)
		const group = data.group
		if (!group) return

		seedInfiniteQuery(context.queryClient, answeredQuestionsQuery(groupId), {
			group: { id: group.id, answeredQuestions: group.answeredQuestions },
		})
		seedInfiniteQuery(context.queryClient, createdQuestionsQuery(groupId), {
			group: { id: group.id, createdQuestions: group.createdQuestions },
		})
		seedInfiniteQuery(context.queryClient, sharedQuestionsQuery(groupId), {
			group: { id: group.id, sharedQuestions: group.sharedQuestions },
		})
		seedInfiniteQuery(
			context.queryClient,
			groupLeaderboardQuery(groupId, filter.leagueId, filter.season),
			{
				group: {
					id: group.id,
					leaderboard: group.leaderboard,
					viewerLeaderboardEntry: group.viewerLeaderboardEntry,
				},
			},
		)
	},
})

// A phone can't fit a group name and several labeled buttons on one line, and
// the name is the more important half - so below md each action shows only its
// icon (plus compactLabel, when set), with the label carried as the button's
// accessible name.
function HeaderAction({
	label,
	compactLabel,
	icon,
	variant,
	onClick,
}: {
	label: string
	compactLabel?: string
	icon: ReactNode
	variant: ButtonVariantProps["variant"]
	onClick: () => void
}) {
	return (
		<Button
			size="sm"
			variant={variant}
			aria-label={label}
			onClick={onClick}
			// Square off the horizontal padding while only the icon shows, so the
			// button doesn't read as a wide empty pill.
			className={css({
				paddingInline: { base: compactLabel ? "3" : "2.5", md: "4.5" },
			})}
		>
			<span
				className={css({
					display: { base: "flex", md: "none" },
					alignItems: "center",
					gap: "1.5",
				})}
			>
				{icon}
				{compactLabel}
			</span>
			<span className={css({ display: { base: "none", md: "inline" } })}>
				{label}
			</span>
		</Button>
	)
}

// The same cached GroupDetail the loader fetched, read by both the page and
// its rail. The rail renders in the app shell, outside this route's component,
// so it can't be handed the page's data as props.
function useGroupDetail() {
	const { groupId } = Route.useParams()
	const search = Route.useSearch()
	const { leagues } = Route.useRouteContext()
	const { data: trackedData } = useSuspenseQuery(groupLeaguesQuery(groupId))
	const trackedLeagues = trackedData.group?.trackedLeagues ?? []
	const scope = groupLeagueScope(leagues, trackedLeagues)
	const filter = resolveLeaderboardFilter(scope.leagues, search, {
		allLeaguesLabel: scope.allLeaguesLabel,
	})
	const { data } = useSuspenseQuery(
		groupDetailQuery(groupId, filter.leagueId, filter.season),
	)
	return { group: data.group, scope, filter }
}

function GroupRail() {
	const { group } = useGroupDetail()
	if (!group) return null
	return (
		<GroupHighlightsRail
			groupId={group.id}
			hotStreaks={group.hotStreaks}
			coldStreaks={group.coldStreaks}
			streakRecords={group.streakRecords}
			recentSweeps={group.recentSweeps}
		/>
	)
}

// Opens the welcome modal for a member who hasn't been welcomed to this group
// yet, once per group per mount. Deferred a frame because the root layout
// closes every modal when the pathname changes, and its effect runs after
// this one on the navigation that lands here from joining.
function useOpenWelcome(groupId: string | null) {
	const openedFor = useRef<string | null>(null)
	useEffect(() => {
		if (!groupId || openedFor.current === groupId) return
		const frame = requestAnimationFrame(() => {
			openedFor.current = groupId
			openModal(<GroupWelcomeModal groupId={groupId} />)
		})
		return () => cancelAnimationFrame(frame)
	}, [groupId])
}

function RouteComponent() {
	const [activeTab, setActiveTab] = useState<"answered" | "created" | "shared">(
		"answered",
	)
	const navigate = Route.useNavigate()
	const { group, scope, filter } = useGroupDetail()
	const { me } = useRouteContext({ from: "__root__" })
	useOpenWelcome(group && !group.viewerDismissedWelcome ? group.id : null)

	if (!group) {
		return (
			<NotFound
				icon={<HiMiniQuestionMarkCircle size="24" />}
				eyebrowText="Group"
				heading="This group doesn't exist"
				subtitle="It may have been deleted, or the link's just wrong. Double check the URL."
				link={{
					text: "View your groups",
					url: "/groups",
				}}
			/>
		)
	}

	return (
		<VStack alignItems="stretch" gap="6">
			<PageBanner
				bannerUrl={group.bannerUrl ?? null}
				edit={
					group.viewerIsAdmin
						? {
								target: { kind: "banner", groupId: group.id },
								title: "Group banner",
							}
						: null
				}
			/>
			<Breadcrumb>
				<Breadcrumb.Link to="/groups">Groups</Breadcrumb.Link>
				<Breadcrumb.Current>{group.name}</Breadcrumb.Current>
			</Breadcrumb>
			<GroupHeader
				name={group.name}
				logoUrl={group.logoUrl}
				description={group.description}
				links={group.links}
				actions={
					<HStack gap="2">
						<HeaderAction
							label={`${group.memberCount} ${pluralize(group.memberCount, "member")}`}
							compactLabel={String(group.memberCount)}
							icon={<FiUsers size={16} />}
							variant="outline"
							onClick={() =>
								openModal(
									<GroupMembersSheet groupId={group.id} viewerId={me?.id} />,
								)
							}
						/>
						<HeaderAction
							label="Settings"
							icon={<FiSettings size={16} />}
							variant="outline"
							onClick={() =>
								navigate({
									to: "/groups/$groupId/settings",
									params: { groupId: group.id },
								})
							}
						/>
						<HeaderAction
							label="Invite"
							icon={<FiUserPlus size={16} />}
							variant="dark"
							onClick={() =>
								openModal(
									<InviteCodeModal
										groupId={group.id}
										groupName={group.name}
										inviteId={group.myInvite.id}
										inviteCode={group.myInvite.code}
										expirationDate={group.myInvite.expiresAt}
									/>,
								)
							}
						/>
					</HStack>
				}
			/>
			<GroupPinnedStrip
				groupId={group.id}
				pins={group.pinnedQuestions}
				viewerIsAdmin={group.viewerIsAdmin}
			/>
			<GroupInviteCard
				groupId={group.id}
				groupName={group.name}
				memberCount={group.memberCount}
				inviteCode={group.myInvite.code}
				dismissed={group.viewerDismissedInviteCard}
			/>
			<GroupLeaderboard
				groupId={group.id}
				leagues={scope.leagues}
				filter={filter}
				onFilterChange={(next) => navigate({ search: next })}
				viewerId={me?.id}
			/>
			<GroupHighlights
				groupId={group.id}
				hotStreaks={group.hotStreaks}
				coldStreaks={group.coldStreaks}
				streakRecords={group.streakRecords}
				recentSweeps={group.recentSweeps}
			/>
			<VStack alignItems="stretch" gap="3">
				<h2
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						letterSpacing: "wide",
						color: "fg.muted",
						textTransform: "uppercase",
					})}
				>
					Activity
				</h2>
				<Tabs value={activeTab} onValueChange={setActiveTab}>
					<Tabs.List>
						<Tabs.Trigger value="answered">Answered</Tabs.Trigger>
						<Tabs.Trigger value="created">Created</Tabs.Trigger>
						<Tabs.Trigger value="shared">Shared</Tabs.Trigger>
					</Tabs.List>
				</Tabs>
			</VStack>
			{match(activeTab)
				.with("answered", () => <AnsweredQuestionsTab groupId={group.id} />)
				.with("created", () => <CreatedQuestionsTab groupId={group.id} />)
				.with("shared", () => <SharedQuestionsTab groupId={group.id} />)
				.exhaustive()}
		</VStack>
	)
}
