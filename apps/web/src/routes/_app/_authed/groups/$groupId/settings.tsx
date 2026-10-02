import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { HiMiniQuestionMarkCircle } from "react-icons/hi2"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GroupDangerZone } from "#/components/groups/group-danger-zone"
import { GroupGeneralSection } from "#/components/groups/group-general-section"
import { GroupImagesSection } from "#/components/groups/group-images-section"
import { GroupInvitesSection } from "#/components/groups/group-invites-section"
import { GroupLinksSection } from "#/components/groups/group-links-section"
import { GroupMembersSection } from "#/components/groups/group-members-section"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { GroupSettingsDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"

const groupSettingsQuery = (groupId: string) =>
	gqlQueryOptions(GroupSettingsDocument, { groupId })

export const Route = createFileRoute("/_app/_authed/groups/$groupId/settings")({
	component: RouteComponent,
	loader: ({ context, params }) =>
		context.queryClient.query(groupSettingsQuery(params.groupId)),
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

// Open to every member so anyone can leave; the sections that change the
// group itself only render for admins.
function RouteComponent() {
	const { groupId } = Route.useParams()
	const { leagues } = Route.useRouteContext()
	const { me } = useRouteContext({ from: "__root__" })
	const { data } = useSuspenseQuery(groupSettingsQuery(groupId))
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

	const members = group.members.map((m) => ({
		role: m.role,
		joinedAt: m.joinedAt,
		user: m.user,
	}))

	return (
		<VStack alignItems="stretch" gap="8" maxWidth="xl">
			<Breadcrumb>
				<Breadcrumb.Link to="/groups">Groups</Breadcrumb.Link>
				<Breadcrumb.Link to="/groups/$groupId" params={{ groupId: group.id }}>
					{group.name}
				</Breadcrumb.Link>
				<Breadcrumb.Current>Settings</Breadcrumb.Current>
			</Breadcrumb>
			<PageHeader title="Group settings" subtitle={group.name} />
			{group.viewerIsAdmin && (
				<>
					<VStack alignItems="stretch" gap="3">
						{sectionLabel("General")}
						<GroupGeneralSection
							groupId={group.id}
							groupName={group.name}
							groupDescription={group.description ?? null}
							leagues={leagues}
							trackedLeagueIds={group.trackedLeagues.map((l) => l.id)}
						/>
					</VStack>
					<VStack alignItems="stretch" gap="3">
						{sectionLabel("Links")}
						<GroupLinksSection groupId={group.id} links={group.links} />
					</VStack>
					<VStack alignItems="stretch" gap="3">
						{sectionLabel("Logo and banner")}
						<GroupImagesSection
							groupId={group.id}
							groupName={group.name}
							logoUrl={group.logoUrl ?? null}
							bannerUrl={group.bannerUrl ?? null}
						/>
					</VStack>
					<VStack alignItems="stretch" gap="3">
						{sectionLabel(`Members · ${members.length}`)}
						<GroupMembersSection
							groupId={group.id}
							groupName={group.name}
							viewerId={me?.id}
							members={members}
						/>
					</VStack>
					<VStack alignItems="stretch" gap="3">
						{sectionLabel("Invite links")}
						<GroupInvitesSection invites={group.invites} />
					</VStack>
				</>
			)}
			<VStack alignItems="stretch" gap="3">
				{sectionLabel("Danger zone")}
				<GroupDangerZone
					groupId={group.id}
					groupName={group.name}
					viewerId={me?.id}
					viewerIsAdmin={group.viewerIsAdmin}
					members={members}
				/>
			</VStack>
		</VStack>
	)
}
