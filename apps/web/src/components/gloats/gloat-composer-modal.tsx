import { GLOAT_TEXT_MAX } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { Textarea } from "#/components/ui/textarea"
import {
	invalidateChallenges,
	SendChallengeGloatDocument,
} from "#/graphql/challenges/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { closeModal } from "#/stores/modal-store"
import { type Gif, GifPicker } from "./gif-picker"

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
	const [text, setText] = useState("")
	const [gif, setGif] = useState<Gif | null>(null)
	const [error, setError] = useState<string | null>(null)
	const canSend = text.trim().length > 0 || gif !== null

	async function submit() {
		setError(null)
		const result = (
			await send.mutateAsync({
				input: {
					challengeId,
					text: text.trim() || undefined,
					gif: gif
						? {
								id: gif.id,
								url: gif.url,
								width: gif.width,
								height: gif.height,
								alt: gif.alt,
							}
						: undefined,
				},
			})
		)?.sendChallengeGloat
		if (result?.__typename === "GloatSentPayload") {
			await invalidateChallenges(queryClient)
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
			<Modal.Title>Trash talk</Modal.Title>
			<Modal.Description>
				Goes to {recipients}. You get one, and it can't be edited once it's
				sent.
			</Modal.Description>
			<VStack gap="4" alignItems="stretch">
				<Textarea>
					<Textarea.Label>
						{gifsEnabled
							? "Say something (optional with a GIF)"
							: "Say something"}
					</Textarea.Label>
					<Textarea.Field
						maxLength={GLOAT_TEXT_MAX}
						value={text}
						onChange={(e) => setText(e.target.value)}
					/>
					<Textarea.CharCount value={text} max={GLOAT_TEXT_MAX} />
				</Textarea>
				{gifsEnabled && <GifPicker selected={gif} onSelect={setGif} />}
				<FormError message={error} />
				<Button
					variant="solid"
					size="lg"
					fullWidth
					disabled={!canSend || send.isPending}
					loading={send.isPending}
					onClick={submit}
				>
					Send it
				</Button>
			</VStack>
		</Modal>
	)
}
