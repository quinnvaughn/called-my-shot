import { useMutation } from "@apollo/client/react"
import { fileDisputeSchema } from "@called-my-shot/schemas"
import { useRouter } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { Textarea } from "#/components/ui/textarea"
import { FileDisputeDocument } from "#/graphql/mutations/questions"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"

type Props = {
	questionId: string
}

export function DisputeModal({ questionId }: Props) {
	const [fileDispute] = useMutation(FileDisputeDocument)
	const router = useRouter()

	const form = useForm({
		schema: fileDisputeSchema,
		defaultValues: { questionId, reason: "" },
		onSubmit: async (values, helpers) => {
			const { data } = await fileDispute({
				variables: {
					input: { questionId: values.questionId, reason: values.reason },
				},
			})
			const result = data?.fileDispute

			if (!result) {
				helpers.setFormError("Something went wrong. Try again.")
				return
			}

			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					const errors: Record<string, string | null> = {}
					for (const fieldError of r.fieldErrors ?? []) {
						if (fieldError.field) errors[fieldError.field] = fieldError.message
						else helpers.setFormError(fieldError.message)
					}
					helpers.setErrors(errors)
				})
				.with({ __typename: "AuthenticationError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "AuthorizationError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "NotFoundError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "FileDisputePayload" }, async () => {
					track("question_disputed", {
						questionId: values.questionId,
						reason: values.reason,
					})
					await router.invalidate()
					closeModal()
				})
				.exhaustive()
		},
	})

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Dispute this resolution</Modal.Title>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="4" alignItems="stretch">
					<form.Field name="reason">
						{(field) => (
							<Textarea error={field.meta.error ?? undefined}>
								<Textarea.Label required>Reason</Textarea.Label>
								<Textarea.Field
									placeholder="What's incorrect about this result?"
									maxLength={500}
									value={field.value}
									onChange={field.onChange}
									onBlur={field.onBlur}
								/>
							</Textarea>
						)}
					</form.Field>
					<form.Subscribe selector={(s) => s.meta}>
						{(meta) => (
							<VStack gap="2" alignItems="stretch">
								<Button
									type="submit"
									variant="solid"
									size="lg"
									fullWidth
									loading={meta.isSubmitting}
									disabled={meta.isSubmitting || !meta.canSubmit}
								>
									Submit Dispute
								</Button>
								<FormError message={meta.formError} />
							</VStack>
						)}
					</form.Subscribe>
				</VStack>
			</form>
		</Modal>
	)
}
