import { useSuspenseQuery } from "@tanstack/react-query"
import {
	createFileRoute,
	Outlet,
	useNavigate,
	useRouteContext,
} from "@tanstack/react-router"
import type { ReactNode } from "react"
import { FiSettings, FiUserPlus, FiUsers } from "react-icons/fi"
import { HiMiniQuestionMarkCircle } from "react-icons/hi2"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GroupHeader } from "#/components/groups/group-header"
import { GroupHighlightsRail } from "#/components/groups/group-highlights"
import { GroupMembersSheet } from "#/components/groups/group-members-sheet"
import { InviteCodeModal } from "#/components/groups/invite-code-modal"
import { PageBanner } from "#/components/images/page-banner"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Button, type ButtonVariantProps } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import { Tag } from "#/components/ui/tag"
import { GroupShellDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { pluralize } from "#/lib/pluralize"
import { openModal } from "#/stores/modal-store"

export const groupShellQuery = (groupId: string) =>
	gqlQueryOptions(GroupShellDocument, { groupId })

// Everything the group's tabs share: the banner, the header and its actions,
// the tab row, and the highlights rail. Each tab below loads only its own
// content, so switching between them doesn't refetch any of this.
//
// New areas of a group get a tab here rather than another strip on Home,
// which is kept to what's happening in the group right now.
export const Route = createFileRoute("/_app/_authed/groups/$groupId/_tabs")({
	component: RouteComponent,
	staticData: { rightRail: <GroupRail /> },
	loader: ({ context, params }) =>
		context.queryClient.query(groupShellQuery(params.groupId)),
})

const TAB_ITEMS = [
	{ to: "/groups/$groupId", label: "Home" },
	{ to: "/groups/$groupId/leaderboard", label: "Leaderboard" },
	{ to: "/groups/$groupId/record-book", label: "Record Book" },
] as const

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

// The rail renders in the app shell, outside this route's component, so it
// reads the same cached shell query rather than being handed props.
function GroupRail() {
	const { groupId } = Route.useParams()
	const { data } = useSuspenseQuery(groupShellQuery(groupId))
	const group = data.group
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

function RouteComponent() {
	const { groupId } = Route.useParams()
	const navigate = useNavigate()
	const { me } = useRouteContext({ from: "__root__" })
	const { data } = useSuspenseQuery(groupShellQuery(groupId))
	const group = data.group

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
