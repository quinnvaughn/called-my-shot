import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { ConfirmByTypingModal } from "#/components/ui/confirm-by-typing-modal"
import { DeleteGroupDocument } from "#/graphql/generated/graphql"
import { invalidateGroups } from "#/graphql/groups/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { pluralize } from "#/lib/pluralize"
import { closeModal } from "#/stores/modal-store"

type Props = {
	groupId: string
	groupName: string
	memberCount: number
}

export function DeleteGroupModal({ groupId, groupName, memberCount }: Props) {
	const deleteGroup = useGqlMutation(DeleteGroupDocument)
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const [error, setError] = useState<string | null>(null)

	async function handleDelete() {
		setError(null)
		const data = await deleteGroup.mutateAsync({ groupId })
		const result = data?.deleteGroup
		if (result?.__typename !== "MutationDeleteGroupSuccess") {
			setError(result?.message ?? "Something went wrong. Try again.")
			return
		}
		track("group_deleted", { groupId, memberCount })
		closeModal()
		// Away from the group first, so refetching doesn't briefly render a page
		// for a group that no longer exists.
		await navigate({ to: "/spaces" })
		await invalidateGroups(queryClient)
	}

	return (
		<ConfirmByTypingModal
			title="Delete group"
			description={
				<>
					This deletes{" "}
					<b className={css({ fontWeight: "semibold", color: "fg.default" })}>
						{groupName}
					</b>{" "}
					for all {memberCount} {pluralize(memberCount, "member")}, along with
					its leaderboard, shared questions, and invite links. Everyone's calls
					and points stay on their profiles.
				</>
			}
			confirmLabel="Delete group"
			submitting={deleteGroup.isPending}
			error={error}
			onSubmit={handleDelete}
		/>
	)
}
