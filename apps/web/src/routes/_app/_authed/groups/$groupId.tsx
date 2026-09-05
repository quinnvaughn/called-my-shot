import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { useState } from "react"
import { HiMiniQuestionMarkCircle } from "react-icons/hi2"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import {
	AnsweredQuestionsTab,
	answeredQuestionsQuery,
} from "#/components/groups/answered-questions-tab"
import {
	CreatedQuestionsTab,
	createdQuestionsQuery,
} from "#/components/groups/created-questions-tab"
import {
	GroupLeaderboard,
	groupLeaderboardQuery,
} from "#/components/groups/group-leaderboard"
import { InviteCodeModal } from "#/components/groups/invite-code-modal"
import {
	SharedQuestionsTab,
	sharedQuestionsQuery,
} from "#/components/groups/shared-questions-tab"
import { Button } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { GroupDetailDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions, seedInfiniteQuery } from "#/graphql/query-options"
import { pluralize } from "#/lib/pluralize"
import { openModal } from "#/stores/modal-store"

const groupDetailQuery = (groupId: string) =>
	gqlQueryOptions(GroupDetailDocument, { groupId })

export const Route = createFileRoute("/_app/_authed/groups/$groupId")({
	component: RouteComponent,
	// Every list on this page gets its first page as an aliased field of one
	// query (see GroupDetailDocument), so those pages are handed to the
	// infinite caches the lists paginate with rather than costing a request
	// each. The leaderboard is seeded for the "All" league only - picking a
	// league is a different key and fetches on its own.
	loader: async ({ context, params }) => {
		const { groupId } = params
		const data = await context.queryClient.query(groupDetailQuery(groupId))
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
			groupLeaderboardQuery(groupId, null),
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

function RouteComponent() {
	const [activeTab, setActiveTab] = useState<"answered" | "created" | "shared">(
		"answered",
	)
	const { groupId } = Route.useParams()
	const { data } = useSuspenseQuery(groupDetailQuery(groupId))
	const group = data.group
	const leagues = data.leagues
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
				subtitle={`${group.memberCount} ${pluralize(group.memberCount, "member")}`}
				action={
					<Button
						size="sm"
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
					>
						Invite
					</Button>
				}
			/>
			<GroupLeaderboard
				groupId={group.id}
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
				.with("answered", () => <AnsweredQuestionsTab groupId={group.id} />)
				.with("created", () => <CreatedQuestionsTab groupId={group.id} />)
				.with("shared", () => <SharedQuestionsTab groupId={group.id} />)
				.exhaustive()}
		</VStack>
	)
}
