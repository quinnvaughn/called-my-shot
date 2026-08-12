import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { useState } from "react"
import { HiMiniQuestionMarkCircle } from "react-icons/hi2"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { IncorrectGroup } from "#/components/groups/incorrect-group"
import { InviteCodeModal } from "#/components/groups/invite-code-modal"
import { Avatar } from "#/components/ui/avatar"
import { Button } from "#/components/ui/button"
import { Table } from "#/components/ui/table"
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
		return { group: data?.group ?? null }
	},
})

function RouteComponent() {
	const [activeTab, setActiveTab] = useState<"answered" | "created" | "shared">(
		"answered",
	)
	const { group } = Route.useLoaderData()
	const { me } = useRouteContext({ from: "__root__" })

	if (!group) {
		return (
			<IncorrectGroup
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
			<HStack alignItems="flex-start" justify="space-between" gap="4">
				<VStack gap="1" alignItems="flex-start">
					<h1 className={css({ fontSize: "3xl", fontFamily: "heading" })}>
						{group.name}
					</h1>
					<p
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							color: "fg.muted",
						})}
					>
						{group.memberCount} members
					</p>
				</VStack>
				<Button
					size="sm"
					variant="white"
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
			</HStack>
			<Table sortBy="rank" sortDir="desc">
				<Table.Head
					columns={[
						{ key: "rank", label: "#", numeric: true, width: "56px" },
						{ key: "member", label: "Member" },
						{ key: "points", label: "Points", numeric: true, width: "120px" },
					]}
				/>
				<Table.Body>
					{group.leaderboard.map((entry, i) => (
						<Table.Row key={entry.user.id} active={entry.user.id === me?.id}>
							<Table.Cell
								numeric
								className={css({
									color: i <= 2 ? "primary.default" : "fg.subtle",
									fontWeight: i <= 2 ? "bold" : "inherit",
									fontSize: "sm",
									fontFamily: "mono",
								})}
							>
								{entry.rank}
							</Table.Cell>
							<Table.Cell>
								<HStack gap="3">
									<Avatar size="sm" name={entry.user.name} />
									<span
										className={css({ fontSize: "sm", fontWeight: "medium" })}
									>
										{entry.user.name} (@{entry.user.username})
									</span>
								</HStack>
							</Table.Cell>
							<Table.Cell
								numeric
								className={css({ fontFamily: "mono", fontSize: "sm" })}
							>
								{entry.totalPoints}
							</Table.Cell>
						</Table.Row>
					))}
				</Table.Body>
			</Table>
			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<Tabs.List>
					<Tabs.Trigger value="answered">Answered</Tabs.Trigger>
					<Tabs.Trigger value="created">Created</Tabs.Trigger>
					<Tabs.Trigger value="shared">Shared</Tabs.Trigger>
				</Tabs.List>
			</Tabs>
		</VStack>
	)
}
