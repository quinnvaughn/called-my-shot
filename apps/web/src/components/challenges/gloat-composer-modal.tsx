import { useQueryClient } from "@tanstack/react-query"
import { CommentComposer } from "#/components/comments/comment-composer"
import { Modal } from "#/components/ui/modal"
import {
	invalidateChallenges,
	SendChallengeGloatDocument,
} from "#/graphql/challenges/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { closeModal } from "#/stores/modal-store"

type Props = {
	challengeId: string
	// Who it goes to, as the modal says it: "@quinn", "the 4 people you beat".
	recipients: string
	// Read with the page, so the picker is there the moment the modal opens.
	gifsEnabled: boolean
}

// A winner's one gloat: their own words, a GIF, or both. Sent once, and it
// can't be taken back.
export function GloatComposerModal({
	challengeId,
	recipients,
	gifsEnabled,
}: Props) {
	const send = useGqlMutation(SendChallengeGloatDocument)
	const queryClient = useQueryClient()

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Trash talk</Modal.Title>
			<Modal.Description>
				Goes to {recipients}. You get one, and it can't be edited once it's
				sent.
			</Modal.Description>
			<CommentComposer
				gifsEnabled={gifsEnabled}
				placeholder="Say something"
				pending={send.isPending}
				onSubmit={async (draft) => {
					const result = (
						await send.mutateAsync({ input: { challengeId, ...draft } })
					)?.sendChallengeGloat
					if (result?.__typename === "GloatSentPayload") {
						await invalidateChallenges(queryClient)
						closeModal()
						return null
					}
					return result?.__typename === "ValidationError"
						? (result.fieldErrors[0]?.message ?? result.message)
						: (result?.message ?? "Something went wrong. Try again.")
				}}
			/>
		</Modal>
	)
}
