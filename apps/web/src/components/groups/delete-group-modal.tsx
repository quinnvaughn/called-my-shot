import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { DeleteGroupDocument } from "#/graphql/generated/graphql"
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
	const [confirmText, setConfirmText] = useState("")
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
		await navigate({ to: "/groups" })
		await queryClient.invalidateQueries()
	}

	return (
		<Modal size="sm">
			<Modal.CloseButton />
			<Modal.Title className={css({ color: "danger.default" })}>
				Delete group
			</Modal.Title>
			<VStack gap="3.5" alignItems="stretch">
				<Modal.Description>
					This deletes{" "}
					<b className={css({ fontWeight: "semibold", color: "fg.default" })}>
						{groupName}
					</b>{" "}
					for all {memberCount} {pluralize(memberCount, "member")}, along with
					its leaderboard, shared questions, and invite links. Everyone's calls
					and points stay on their profiles.
				</Modal.Description>
				<TextInput>
					<TextInput.Label>Type DELETE to confirm</TextInput.Label>
					<TextInput.Group>
						<TextInput.Field
							placeholder="DELETE"
							autoComplete="off"
							value={confirmText}
							onChange={(e) => setConfirmText(e.target.value)}
						/>
					</TextInput.Group>
				</TextInput>
				<VStack gap="2" alignItems="stretch">
					<Button
						variant="solid"
						size="md"
						fullWidth
						loading={deleteGroup.isPending}
						disabled={deleteGroup.isPending || confirmText !== "DELETE"}
						className={css({ bg: "danger.default" })}
						onClick={handleDelete}
					>
						Delete group
					</Button>
					<FormError message={error} />
				</VStack>
			</VStack>
		</Modal>
	)
}
