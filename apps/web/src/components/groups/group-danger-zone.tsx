import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { LeaveGroupDocument } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { pluralize } from "#/lib/pluralize"
import { openModal } from "#/stores/modal-store"
import { ConfirmActionModal } from "./confirm-action-modal"
import { DeleteGroupModal } from "./delete-group-modal"
import type { SettingsMember } from "./settings-member"

type Props = {
	groupId: string
	groupName: string
	viewerId?: string
	viewerIsAdmin: boolean
	members: SettingsMember[]
}

const dangerButton = css({
	border: "1px solid {colors.danger.default}",
	color: "danger.default",
})

// What leaving does depends on who's left behind: the last member takes the
// group with them, and the last admin hands it to the longest-standing
// member (see leaveGroup).
function leaveConsequence(
	groupName: string,
	viewer: SettingsMember | undefined,
	others: SettingsMember[],
) {
	if (others.length === 0) {
		return {
			body: `You're the only member, so leaving deletes ${groupName}.`,
			confirmLabel: "Leave and delete",
		}
	}
	const successor = [...others].sort((a, b) =>
		a.joinedAt.localeCompare(b.joinedAt),
	)[0]
	if (viewer?.role === "ADMIN" && !others.some((m) => m.role === "ADMIN")) {
		return {
			body: `You're the only admin, so @${successor.user.username} becomes admin when you leave. Your invite link stops working.`,
			confirmLabel: "Leave group",
		}
	}
	return {
		body: `You'll drop off ${groupName}'s leaderboard and your invite link stops working. Anyone in the group can invite you back.`,
		confirmLabel: "Leave group",
	}
}

export function GroupDangerZone({
	groupId,
	groupName,
	viewerId,
	viewerIsAdmin,
	members,
}: Props) {
	const leaveGroup = useGqlMutation(LeaveGroupDocument)
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const viewer = members.find((m) => m.user.id === viewerId)
	const others = members.filter((m) => m.user.id !== viewerId)
	const leave = leaveConsequence(groupName, viewer, others)

	async function handleLeave() {
		const data = await leaveGroup.mutateAsync({ groupId })
		const result = data?.leaveGroup
		if (result?.__typename !== "MutationLeaveGroupSuccess") {
			return result?.message ?? "Something went wrong. Try again."
		}
		track("group_left", { groupId, memberCount: members.length })
		// Away from the group first, so refetching doesn't briefly render this
		// page for a group the viewer is no longer in.
		await navigate({ to: "/groups" })
		await queryClient.invalidateQueries()
		return null
	}

	return (
		<Card>
			<Card.Body>
				<VStack alignItems="stretch" gap="4">
					<DangerRow
						title="Leave group"
						description="Takes you off the leaderboard and out of the activity feed. Your calls and points stay on your profile."
						action={
							<Button
								variant="outline"
								size="sm"
								className={dangerButton}
								onClick={() =>
									openModal(
										<ConfirmActionModal
											title="Leave group"
											confirmLabel={leave.confirmLabel}
											danger
											onConfirm={handleLeave}
										>
											{leave.body}
										</ConfirmActionModal>,
									)
								}
							>
								Leave group
							</Button>
						}
					/>
					{viewerIsAdmin && (
						<DangerRow
							title="Delete group"
							description={`Removes the group for all ${members.length} ${pluralize(members.length, "member")}. Everyone's calls and points stay on their profiles. Can't be undone.`}
							action={
								<Button
									variant="outline"
									size="sm"
									className={dangerButton}
									onClick={() =>
										openModal(
											<DeleteGroupModal
												groupId={groupId}
												groupName={groupName}
												memberCount={members.length}
											/>,
										)
									}
								>
									Delete group
								</Button>
							}
						/>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)
}

function DangerRow({
	title,
	description,
	action,
}: {
	title: string
	description: string
	action: ReactNode
}) {
	return (
		<HStack justify="space-between" alignItems="center" gap="4">
			<VStack gap="0.5" alignItems="flex-start">
				<span className={css({ fontWeight: "semibold", fontSize: "sm" })}>
					{title}
				</span>
				<span
					className={css({
						fontSize: "xs",
						color: "fg.muted",
						maxWidth: "38ch",
					})}
				>
					{description}
				</span>
			</VStack>
			{action}
		</HStack>
	)
}
