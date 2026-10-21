import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { ConfirmActionModal } from "#/components/ui/confirm-action-modal"
import { LeaveGroupDocument } from "#/graphql/generated/graphql"
import { invalidateGroups } from "#/graphql/groups/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { leaveConsequence } from "#/lib/leave-group"
import { pluralize } from "#/lib/pluralize"
import { openModal } from "#/stores/modal-store"
import { DangerRow } from "./danger-row"
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
		await navigate({ to: "/spaces" })
		await invalidateGroups(queryClient)
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
