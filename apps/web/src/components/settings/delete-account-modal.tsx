import { useMutation } from "@apollo/client/react"
import { deleteAccountSchema } from "@called-my-shot/schemas"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { DeleteAccountDocument } from "#/graphql/queries/user"
import { useSignOut } from "#/hooks/use-sign-out"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"

type Props = {
	username: string
}

export function DeleteAccountModal({ username }: Props) {
	const { signOut } = useSignOut()
	const [deleteAccount] = useMutation(DeleteAccountDocument)
	const [confirmText, setConfirmText] = useState("")

	const form = useForm({
		defaultValues: { password: "" },
		schema: deleteAccountSchema,
		onSubmit: async (values, helpers) => {
			const { data } = await deleteAccount({ variables: { input: values } })
			const result = data?.deleteAccount

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
				.with({ __typename: "MutationDeleteAccountSuccess" }, async () => {
					closeModal()
					await signOut()
				})
				.exhaustive()
		},
	})

	return (
		<Modal size="sm">
			<Modal.CloseButton />
			<Modal.Title className={css({ color: "danger.default" })}>
				Delete account
			</Modal.Title>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="3.5" alignItems="stretch">
					<Modal.Description>
						This deletes{" "}
						<b className={css({ fontWeight: "semibold", color: "fg.default" })}>
							@{username}
						</b>{" "}
						and every call, point, and rank tied to it. There's no getting it
						back.
					</Modal.Description>
					<form.Field name="password">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Confirm password</TextInput.Label>
								<TextInput.Password
									autoComplete="current-password"
									placeholder="Enter your password"
									value={field.value}
									onChange={field.onChange}
									onBlur={field.onBlur}
								/>
							</TextInput>
						)}
					</form.Field>
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
					<form.Subscribe selector={(s) => s.meta}>
						{(meta) => (
							<VStack gap="2" alignItems="stretch">
								<Button
									type="submit"
									variant="solid"
									size="md"
									fullWidth
									loading={meta.isSubmitting}
									disabled={
										meta.isSubmitting ||
										!meta.canSubmit ||
										confirmText !== "DELETE"
									}
									className={css({ bg: "danger.default" })}
								>
									Delete my account
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
