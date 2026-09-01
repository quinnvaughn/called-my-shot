import { useMutation } from "@apollo/client/react"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { DeleteQuestionDocument } from "#/graphql/mutations/admin"
import { closeModal } from "#/stores/modal-store"

type Props = {
	question: { id: string; title: string }
	onDeleted: () => void
}

export function DeleteQuestionModal({ question, onDeleted }: Props) {
	const [deleteQuestion] = useMutation(DeleteQuestionDocument)
	const [submitting, setSubmitting] = useState(false)
	const [formError, setFormError] = useState<string | null>(null)

	async function handleDelete() {
		setFormError(null)
		setSubmitting(true)
		try {
			const { data } = await deleteQuestion({
				variables: { input: { questionId: question.id } },
			})
			const result = data?.deleteQuestion
			if (!result) {
				setFormError("Something went wrong. Try again.")
				return
			}
			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					setFormError(
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
				.with({ __typename: "DeleteQuestionPayload" }, async () => {
					closeModal()
					onDeleted()
				})
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Delete question</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				<VStack
					gap="1"
					alignItems="flex-start"
					className={css({
						bg: "bg.canvas",
						border: "1px solid {colors.border.default}",
						borderRadius: "lg",
						padding: "3",
					})}
				>
					<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
						{question.title}
					</span>
				</VStack>

				<p
					className={css({
						fontSize: "xs",
						lineHeight: "1.55",
						color: "fg.subtle",
						bg: "bg.canvas",
						border: "1px solid {colors.border.default}",
						borderRadius: "lg",
						padding: "3",
					})}
				>
					Deletes this official question and every call made on it. Can't be
					undone.
				</p>

				<FormError message={formError} />
			</VStack>
			<HStack justify="flex-end" gap="3">
				<Button variant="ghost" onClick={closeModal}>
					Cancel
				</Button>
				<Button
					variant="solid"
					loading={submitting}
					disabled={submitting}
					className={css({ bg: "danger.default" })}
					onClick={handleDelete}
				>
					Delete question
				</Button>
			</HStack>
		</Modal>
	)
}
