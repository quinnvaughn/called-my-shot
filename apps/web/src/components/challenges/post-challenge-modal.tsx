import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { ToggleRow } from "#/components/ui/toggle-row"
import { useGqlMutation } from "#/graphql/hooks"
import { PostChallengeToGroupsDocument } from "#/graphql/mutations/challenges"
import { ChallengePostGroupsDocument } from "#/graphql/queries/challenges"
import { gqlQueryOptions } from "#/graphql/query-options"
import { closeModal } from "#/stores/modal-store"

// Posts a challenge onto the Home of the creator's groups, telling everyone
// else in them.
export function PostChallengeModal({ challengeId }: { challengeId: string }) {
	const { data } = useQuery(gqlQueryOptions(ChallengePostGroupsDocument, {}))
	const post = useGqlMutation(PostChallengeToGroupsDocument)
	const queryClient = useQueryClient()
	const [groupIds, setGroupIds] = useState<string[]>([])
	const [error, setError] = useState<string | null>(null)
	const groups = data?.myGroups ?? []

	async function submit() {
		setError(null)
		const result = (
			await post.mutateAsync({ input: { challengeId, groupIds } })
		)?.postChallengeToGroups
		if (result?.__typename === "ChallengePayload") {
			await queryClient.invalidateQueries()
			closeModal()
			return
		}
		setError(
			result?.__typename === "ValidationError"
				? (result.fieldErrors[0]?.message ?? result.message)
				: (result?.message ?? "Something went wrong. Try again."),
		)
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Post to your groups</Modal.Title>
			<Modal.Description>
				It shows on each group's Home and everyone in it gets a notification.
			</Modal.Description>
			{groups.length === 0 ? (
				<EmptyState>You're not in any groups yet.</EmptyState>
			) : (
				<VStack gap="4" alignItems="stretch">
					{groups.map((g) => (
						<ToggleRow
							key={g.id}
							label={g.name}
							checked={groupIds.includes(g.id)}
							onChange={(on) =>
								setGroupIds((ids) =>
									on ? [...ids, g.id] : ids.filter((id) => id !== g.id),
								)
							}
						/>
					))}
					<FormError message={error} />
					<Button
						variant="solid"
						size="lg"
						fullWidth
						disabled={groupIds.length === 0}
						loading={post.isPending}
						onClick={submit}
					>
						Post it
					</Button>
				</VStack>
			)}
		</Modal>
	)
}
