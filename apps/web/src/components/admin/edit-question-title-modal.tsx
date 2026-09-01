import { useMutation } from "@apollo/client/react"
import { editQuestionTitleSchema } from "@called-my-shot/schemas"
import { useState } from "react"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { EditQuestionTitleDocument } from "#/graphql/mutations/admin"
import { closeModal } from "#/stores/modal-store"

type Props = {
	question: { id: string; title: string }
	onEdited: () => void
}

export function EditQuestionTitleModal({ question, onEdited }: Props) {
	const [editQuestionTitle] = useMutation(EditQuestionTitleDocument)
	const [title, setTitle] = useState(question.title)
	const [submitting, setSubmitting] = useState(false)
	const [formError, setFormError] = useState<string | null>(null)
	const [fieldError, setFieldError] = useState<string | null>(null)

	async function handleSave() {
		setFormError(null)
		setFieldError(null)

		const parsed = editQuestionTitleSchema.safeParse({
			questionId: question.id,
			title,
		})
		if (!parsed.success) {
			setFieldError(
				parsed.error.issues[0]?.message ?? "Check the form and try again.",
			)
			return
		}

		setSubmitting(true)
		try {
			const { data } = await editQuestionTitle({
				variables: { input: { questionId: question.id, title } },
			})
			const result = data?.editQuestionTitle
			if (!result) {
				setFormError("Something went wrong. Try again.")
				return
			}
			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					setFieldError(
						r.fieldErrors?.[0]?.message ?? "Check the form and try again.",
					)
				})
				.with({ __typename: "AuthenticationError" }, async (r) => {
					setFormError(r.message)
				})
				.with({ __typename: "AuthorizationError" }, async (r) => {
					setFormError(r.message)
				})
				.with({ __typename: "NotFoundError" }, async (r) => {
					setFormError(r.message)
				})
				.with({ __typename: "QuestionPayload" }, async () => {
					closeModal()
					onEdited()
				})
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Edit title</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				<TextInput>
					<TextInput.Label required>Title</TextInput.Label>
					<TextInput.Group>
						<TextInput.Field
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</TextInput.Group>
				</TextInput>

				<FormError message={formError ?? fieldError} />
			</VStack>
			<HStack justify="flex-end" gap="3">
				<Button variant="ghost" onClick={closeModal}>
					Cancel
				</Button>
				<Button
					variant="solid"
					loading={submitting}
					disabled={submitting}
					onClick={handleSave}
				>
					Save
				</Button>
			</HStack>
		</Modal>
	)
}
