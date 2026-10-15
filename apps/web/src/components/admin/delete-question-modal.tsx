import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { AdminCallout } from "#/components/ui/admin-callout"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import {
	DeleteQuestionDocument,
	invalidateAdminQueue,
} from "#/graphql/admin/queue/mutations"
import { ApiError } from "#/graphql/api-error"
import { useGqlMutation } from "#/graphql/hooks"
import { closeModal } from "#/stores/modal-store"

type Props = {
	question: { id: string; title: string }
}

export function DeleteQuestionModal({ question }: Props) {
	const queryClient = useQueryClient()
	const deleteQuestion = useGqlMutation(DeleteQuestionDocument)
	const [submitting, setSubmitting] = useState(false)
	const [formError, setFormError] = useState<string | null>(null)

	async function handleDelete() {
		setFormError(null)
		setSubmitting(true)
		try {
			const data = await deleteQuestion.mutateAsync({
				input: { questionId: question.id },
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
				.with(ApiError, async (r) => {
					setFormError(r.message)
				})
				.with({ __typename: "DeleteQuestionPayload" }, async () => {
					closeModal()
					invalidateAdminQueue(queryClient)
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

				<AdminCallout>
					Deletes this official question and every call made on it. Can't be
					undone.
				</AdminCallout>

				<FormError message={formError} />
			</VStack>
			<HStack justify="flex-end" gap="3">
				<Button variant="ghost" onClick={closeModal}>
					Cancel
				</Button>
				<Button
					variant="danger"
					loading={submitting}
					disabled={submitting}
					onClick={handleDelete}
				>
					Delete question
				</Button>
			</HStack>
		</Modal>
	)
}
