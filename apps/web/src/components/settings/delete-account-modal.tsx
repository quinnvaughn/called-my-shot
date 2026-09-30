import { deleteAccountSchema } from "@called-my-shot/schemas"
import { useMemo, useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { z } from "zod"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { useGqlMutation } from "#/graphql/hooks"
import { DeleteAccountDocument } from "#/graphql/queries/user"
import { useSignOut } from "#/hooks/use-sign-out"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"

type Props = {
	username: string
	// False for an account made through Google, which has no password to
	// confirm with. Typing DELETE is then the only confirmation.
	hasPassword: boolean
}

export function DeleteAccountModal({ username, hasPassword }: Props) {
	const { signOut } = useSignOut()
	const deleteAccount = useGqlMutation(DeleteAccountDocument)
	const [confirmText, setConfirmText] = useState("")

	const schema = useMemo(
		() =>
			hasPassword
				? deleteAccountSchema
				: deleteAccountSchema.extend({ password: z.string() }),
		[hasPassword],
	)

	const form = useForm({
		defaultValues: { password: "" },
		schema,
		onSubmit: async (values, helpers) => {
			const data = await deleteAccount.mutateAsync({
				input: hasPassword ? values : {},
			})
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
					track("account_deleted", {})
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
					{hasPassword && (
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
					)}
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
