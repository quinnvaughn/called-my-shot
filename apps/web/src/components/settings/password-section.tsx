import { passwordFormSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { SaveNote } from "#/components/ui/save-note"
import { TextInput } from "#/components/ui/text-input"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryPrefix } from "#/graphql/query-options"
import { UpdatePasswordDocument } from "#/graphql/user/settings/mutations"
import { SettingsPageDocument } from "#/graphql/user/settings/queries"
import { useForm } from "#/lib/form/use-form"

type Props = {
	// False for an account made through Google that has never set one. The
	// same form then sets a first password, with no current one to confirm.
	hasPassword: boolean
}

export function PasswordSection({ hasPassword }: Props) {
	const updatePassword = useGqlMutation(UpdatePasswordDocument)
	const queryClient = useQueryClient()
	const [savedNote, setSavedNote] = useState<string | null>(null)
	const schema = passwordFormSchema(hasPassword)

	const form = useForm({
		defaultValues: {
			currentPassword: "",
			newPassword: "",
			confirmPassword: "",
		},
		schema,
		onSubmit: async (values, helpers) => {
			const data = await updatePassword.mutateAsync({
				input: {
					currentPassword: hasPassword ? values.currentPassword : null,
					newPassword: values.newPassword,
				},
			})
			const result = data?.updatePassword

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
					helpers.reset()
					if (!hasPassword) {
						await queryClient.invalidateQueries({
							queryKey: gqlQueryPrefix(SettingsPageDocument),
						})
					}
					setSavedNote(hasPassword ? "Updated" : "Password set")
					setTimeout(() => setSavedNote(null), 2000)
				})
				.exhaustive()
		},
	})

	return (
		<Card>
			<Card.Body>
				<form onSubmit={form.handleSubmit} id="password-form">
					<VStack gap="3.5" alignItems="stretch">
						{hasPassword ? (
							<form.Field name="currentPassword">
								{(field) => (
									<TextInput error={field.meta.error ?? undefined}>
										<TextInput.Label>Current password</TextInput.Label>
										<TextInput.Password
											autoComplete="current-password"
											placeholder="Enter current password"
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
										/>
									</TextInput>
								)}
							</form.Field>
						) : (
							<p className={css({ fontSize: "xs", color: "fg.muted" })}>
								You sign in with Google. Set a password to also sign in with
								your email or username.
							</p>
						)}
						<form.Field name="newPassword">
							{(field) => (
								<TextInput
									error={field.meta.error ?? undefined}
									description="Use at least 8 characters."
								>
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
				</form>
			</Card.Body>
			<Card.Footer>
				<form.Subscribe selector={(s) => s.meta}>
					{(meta) => (
						<HStack justify="flex-end" alignItems="center" gap="3" width="full">
							<SaveNote>{savedNote}</SaveNote>
							<FormError message={meta.formError} />
							<Button
								type="submit"
								form="password-form"
								variant="solid"
								size="sm"
								loading={meta.isSubmitting}
								disabled={meta.isSubmitting || !meta.canSubmit}
							>
								{hasPassword ? "Update password" : "Set password"}
							</Button>
						</HStack>
					)}
				</form.Subscribe>
			</Card.Footer>
		</Card>
	)
}
