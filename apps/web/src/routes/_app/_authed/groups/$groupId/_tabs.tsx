import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { FiSettings, FiUserPlus, FiUsers } from "react-icons/fi"
import { HiMiniQuestionMarkCircle } from "react-icons/hi2"
import { HStack, VStack } from "styled-system/jsx"
import { GroupHeader } from "#/components/groups/group-header"
import { GroupMembersSheet } from "#/components/groups/group-members-sheet"
import { GroupStillOpen } from "#/components/groups/group-still-open/group-still-open"
import { groupStillOpenQuery } from "#/components/groups/group-still-open/still-open-query"
import {
	GroupWeekRace,
	groupWeekRaceQuery,
} from "#/components/groups/group-week-race/group-week-race"
import { HeaderAction } from "#/components/groups/header-action"
import { InviteCodeModal } from "#/components/groups/invite-code-modal"
import { PageBanner } from "#/components/images/page-banner"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import { Tag } from "#/components/ui/tag"
import { GroupShellDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import { pluralize } from "#/lib/pluralize"
import { takeFreshGroup } from "#/stores/fresh-group-store"
import { openModal } from "#/stores/modal-store"

export const groupShellQuery = (groupId: string) =>
	gqlQueryOptions(GroupShellDocument, { groupId })

// Everything the group's tabs share: the banner, the header and its actions,
// the tab row, and the rail: what's still open to call, then the week race. Each tab below loads only its own
// content, so switching between them doesn't refetch any of this.
//
// New areas of a group get a tab here rather than another strip on Home,
// which is kept to what's happening in the group right now.
export const Route = createFileRoute("/_app/_authed/groups/$groupId/_tabs")({
	component: RouteComponent,
	staticData: { rightRail: <GroupRail /> },
	// The rail's lists load here rather than in the rail, so it doesn't
	// suspend on requests of its own after the page has drawn. Home reads the
	// same caches for its below-xl copies.
	loader: async ({ context, params }) => {
		const [shell] = await Promise.all([
			context.queryClient.query(groupShellQuery(params.groupId)),
			context.queryClient.query(groupStillOpenQuery(params.groupId)),
			context.queryClient.query(groupWeekRaceQuery(params.groupId)),
		])
		return shell
	},
})

const TAB_ITEMS = [
	{ to: "/groups/$groupId", label: "Home" },
	{ to: "/groups/$groupId/leaderboard", label: "Leaderboard" },
	{ to: "/groups/$groupId/record-book", label: "Record Book" },
] as const

// The rail renders in the app shell, outside this route's component, so it
// reads the same cached shell query rather than being handed props.
function GroupRail() {
	const { groupId } = Route.useParams()
	const { data } = useSuspenseQuery(groupShellQuery(groupId))
	if (!data.group) return null
	return (
		<VStack alignItems="stretch" gap="8">
			<GroupStillOpen groupId={groupId} placement="rail" />
			<GroupWeekRace groupId={groupId} placement="rail" />
		</VStack>
	)
}

function RouteComponent() {
	const { groupId } = Route.useParams()
	const navigate = useNavigate()
	const me = useMe()
	const { data } = useSuspenseQuery(groupShellQuery(groupId))
	const group = data.group

	// A group this tab just created opens on its invite link, since there's
	// nobody else in it yet. Deferred a tick so it opens after the root closes
	// the previous page's modals on the route change, whichever of the two
	// effects runs first.
	const freshInvite = group?.myInvite
		? { ...group.myInvite, name: group.name }
		: null
	// biome-ignore lint/correctness/useExhaustiveDependencies: once per group
	useEffect(() => {
		if (!freshInvite) return
		// Taken inside the timer, so a cleared one (React's dev double effect)
		// leaves the flag for the run that sticks.
		const timer = setTimeout(() => {
			if (!takeFreshGroup(groupId)) return
			openModal(
				<InviteCodeModal
					groupId={groupId}
					groupName={freshInvite.name}
					inviteId={freshInvite.id}
					inviteCode={freshInvite.code}
					expirationDate={freshInvite.expiresAt}
				/>,
			)
		}, 0)
		return () => clearTimeout(timer)
	}, [groupId])

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

	// Null when a site admin is viewing a group they aren't in.
	const myInvite = group.myInvite

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
						{group.viewerIsMember ? (
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
						) : (
							<Tag size="sm">Admin view</Tag>
						)}
						{myInvite && (
							<HeaderAction
								label="Invite"
								icon={<FiUserPlus size={16} />}
								variant="dark"
								onClick={() =>
									openModal(
										<InviteCodeModal
											groupId={group.id}
											groupName={group.name}
											inviteId={myInvite.id}
											inviteCode={myInvite.code}
											expirationDate={myInvite.expiresAt}
										/>,
									)
								}
							/>
						)}
					</HStack>
				}
			/>
			<Tabs.List>
				{TAB_ITEMS.map((item) => (
					<Tabs.LinkTrigger
						key={item.to}
						to={item.to}
						params={{ groupId: group.id }}
						// Path only: a tab stays lit under its own filters, like the
						// leaderboard's ?league=nfl&season=week.
						activeOptions={{ exact: true, includeSearch: false }}
					>
						{item.label}
					</Tabs.LinkTrigger>
				))}
			</Tabs.List>
			<Outlet />
		</VStack>
	)
}
