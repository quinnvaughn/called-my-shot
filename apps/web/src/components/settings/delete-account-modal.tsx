import { deleteAccountSchema } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { match } from "ts-pattern"
import { z } from "zod"
import { ConfirmByTypingModal } from "#/components/ui/confirm-by-typing-modal"
import { TextInput } from "#/components/ui/text-input"
import { useGqlMutation } from "#/graphql/hooks"
import { DeleteAccountDocument } from "#/graphql/user/settings/mutations"
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

	const schema = hasPassword
		? deleteAccountSchema
		: deleteAccountSchema.extend({ password: z.string() })

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
		<form.Subscribe selector={(s) => s.meta}>
			{(meta) => (
				<ConfirmByTypingModal
					title="Delete account"
					description={
						<>
							This deletes{" "}
							<b
								className={css({ fontWeight: "semibold", color: "fg.default" })}
							>
								@{username}
							</b>{" "}
							and every call, point, and rank tied to it. There's no getting it
							back.
						</>
					}
					confirmLabel="Delete my account"
					submitting={meta.isSubmitting}
					canSubmit={meta.canSubmit}
					error={meta.formError}
					onSubmit={form.handleSubmit}
				>
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
				</ConfirmByTypingModal>
			)}
		</form.Subscribe>
	)
}
