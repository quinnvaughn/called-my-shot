import { useMutation } from "@apollo/client/react"
import { updateNameSchema } from "@called-my-shot/schemas"
import { useRouter } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { UpdateMyNameDocument } from "#/graphql/generated/graphql"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"
import { Button } from "../ui/button"
import { FormError } from "../ui/form-error"
import { Modal } from "../ui/modal"
import { TextInput } from "../ui/text-input"

type Props = {
	currentName: string
}

export function EditNameModal({ currentName }: Props) {
	const [updateMyName] = useMutation(UpdateMyNameDocument)
	const router = useRouter()

	const form = useForm({
		defaultValues: {
			name: currentName,
		},
		schema: updateNameSchema,
		onSubmit: async (values, helpers) => {
			const { data } = await updateMyName({ variables: { input: values } })
			const result = data?.updateMyName

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
				.with({ __typename: "AuthenticationError" }, async () => {
					helpers.setFormError("You need to sign in to do that.")
				})
				.with({ __typename: "User" }, async () => {
					await router.invalidate()
					closeModal()
				})
				.exhaustive()
		},
	})

	return (
		<Modal size="sm">
			<Modal.CloseButton />
			<Modal.Title>Edit display name</Modal.Title>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="3.5" alignItems="stretch">
					<form.Field name="name">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Display name</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										placeholder="Your name"
										type="text"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Field>
					<form.Subscribe selector={(s) => s.meta}>
						{(meta) => (
							<VStack gap="3.5" alignItems="stretch">
								<Button
									type="submit"
									variant="solid"
									size="md"
									fullWidth
									loading={meta.isSubmitting}
									disabled={meta.isSubmitting || !meta.canSubmit}
								>
									Save
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
