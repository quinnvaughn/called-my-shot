import { resetPasswordFormSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { TextInput } from "#/components/ui/text-input"
import { ResetPasswordDocument } from "#/graphql/auth/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { rememberSignInMethod } from "#/lib/last-sign-in"
import { showToast } from "#/stores/toast-store"

export function ResetForm({
	token,
	onLinkError,
}: {
	token: string
	onLinkError: (message: string) => void
}) {
	const resetPassword = useGqlMutation(ResetPasswordDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	const form = useForm({
		schema: resetPasswordFormSchema,
		defaultValues: { newPassword: "", confirmPassword: "" },
		onSubmit: async (values, helpers) => {
			const data = await resetPassword.mutateAsync({
				input: { token, newPassword: values.newPassword },
			})
			const result = data?.resetPassword

			if (!result) {
				helpers.setFormError("Something went wrong. Try again.")
				return
			}

			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					const errors: Record<string, string | null> = {}
					for (const fieldError of r.fieldErrors ?? []) {
						if (fieldError.field === "newPassword") {
							errors.newPassword = fieldError.message
						} else {
							onLinkError(fieldError.message)
						}
					}
					helpers.setErrors(errors)
				})
				.with({ __typename: "AuthPayload" }, async () => {
					rememberSignInMethod("email")
					queryClient.clear()
					await router.invalidate()
					await navigate({ to: "/", replace: true })
					// After leaving, so the event's URL isn't the one carrying
					// the token.
					track("password_reset_completed", {})
					showToast({ message: "Password updated. You're signed in." })
				})
				.exhaustive()
		},
	})

	return (
		<form onSubmit={form.handleSubmit}>
			<VStack gap="5" alignItems="stretch">
				<VStack gap="1" alignItems="flex-start">
					<h1 className={css({ fontFamily: "heading", fontSize: "xl" })}>
						Set a new password
					</h1>
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						Saving it signs you out everywhere else.
					</p>
				</VStack>
				<VStack gap="3.5" alignItems="stretch">
					<form.Field name="newPassword">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>New password</TextInput.Label>
								<TextInput.Password
									autoComplete="new-password"
									placeholder="At least 8 characters"
									value={field.value}
									onChange={field.onChange}
									onBlur={field.onBlur}
								/>
							</TextInput>
						)}
					</form.Field>
					<form.Field name="confirmPassword">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Confirm new password</TextInput.Label>
								<TextInput.Password
									autoComplete="new-password"
									placeholder="Re-enter new password"
									value={field.value}
									onChange={field.onChange}
									onBlur={field.onBlur}
								/>
							</TextInput>
						)}
					</form.Field>
				</VStack>
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
								Save password
							</Button>
							<FormError message={meta.formError} />
						</VStack>
					)}
				</form.Subscribe>
			</VStack>
		</form>
	)
}
