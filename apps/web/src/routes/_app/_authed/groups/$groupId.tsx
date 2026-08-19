import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { useState } from "react"
import { HiMiniQuestionMarkCircle } from "react-icons/hi2"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { AnsweredQuestionsTab } from "#/components/groups/answered-questions-tab"
import { CreatedQuestionsTab } from "#/components/groups/created-questions-tab"
import { GroupLeaderboard } from "#/components/groups/group-leaderboard"
import { InviteCodeModal } from "#/components/groups/invite-code-modal"
import { SharedQuestionsTab } from "#/components/groups/shared-questions-tab"
import { Button } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { GroupDetailDocument } from "#/graphql/generated/graphql"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/_app/_authed/groups/$groupId")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const { data } = await context.apolloClient.query({
			query: GroupDetailDocument,
			variables: { groupId: params.groupId },
		})
		return { group: data?.group ?? null, leagues: data?.leagues ?? [] }
	},
})

function RouteComponent() {
	const [activeTab, setActiveTab] = useState<"answered" | "created" | "shared">(
		"answered",
	)
	const { group, leagues } = Route.useLoaderData()
	const { me } = useRouteContext({ from: "__root__" })

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
			<PageHeader
				title={group.name}
				subtitle={`${group.memberCount} members`}
				action={
					<Button
						size="sm"
						variant="dark"
						onClick={() =>
							openModal(
								<InviteCodeModal
									groupName={group.name}
									inviteId={group.myInvite.id}
									inviteCode={group.myInvite.code}
									expirationDate={group.myInvite.expiresAt}
								/>,
							)
						}
					>
						Invite
					</Button>
				}
			/>
			<GroupLeaderboard
				groupId={group.id}
				initialItems={group.leaderboard.items}
				initialPageInfo={group.leaderboard.pageInfo}
				initialViewerEntry={group.viewerLeaderboardEntry}
				leagues={leagues}
				viewerId={me?.id}
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
				.with("answered", () => (
					<AnsweredQuestionsTab
						groupId={group.id}
						initialItems={group.answeredQuestions.items}
						initialPageInfo={group.answeredQuestions.pageInfo}
					/>
				))
				.with("created", () => (
					<CreatedQuestionsTab
						groupId={group.id}
						initialItems={group.createdQuestions.items}
						initialPageInfo={group.createdQuestions.pageInfo}
					/>
				))
				.with("shared", () => (
					<SharedQuestionsTab
						groupId={group.id}
						initialItems={group.sharedQuestions.items}
						initialPageInfo={group.sharedQuestions.pageInfo}
					/>
				))
				.exhaustive()}
		</VStack>
	)
}
