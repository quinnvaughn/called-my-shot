import { signInSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { TextInput } from "#/components/ui/text-input"
import { SignInDocument } from "#/graphql/auth/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { rememberSignInMethod } from "#/lib/last-sign-in"
import { markGuestPicksEntry } from "#/stores/guest-picks-store"
import { closeModal } from "#/stores/modal-store"
import { LastUsed } from "./last-used"
import { subtleLinkClass } from "./styles"
import type { FieldsProps } from "./types"

export function SignInFields({
	onSuccess,
	surface,
	lastUsed,
	onForgotPassword,
}: FieldsProps & {
	lastUsed: boolean
	onForgotPassword: (identifier: string) => void
}) {
	const signIn = useGqlMutation(SignInDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	const form = useForm({
		schema: signInSchema,
		defaultValues: { identifier: "", password: "" },
		onSubmit: async (values, helpers) => {
			const data = await signIn.mutateAsync({ input: values })
			const result = data?.signIn

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
				.with({ __typename: "AuthPayload" }, async () => {
					track("user_signed_in", { method: "email", surface })
					rememberSignInMethod("email")
					markGuestPicksEntry("signin")
					queryClient.clear()
					await router.invalidate()
					closeModal()
					if (onSuccess) onSuccess()
					else await navigate({ to: "/" })
				})
				.exhaustive()
		},
	})

	return (
		<form onSubmit={form.handleSubmit}>
			<VStack gap="5" alignItems="stretch">
				<VStack gap="3.5" alignItems="stretch">
					<form.Field name="identifier">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Email or username</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										type="text"
										autoCapitalize="off"
										placeholder="you@email.com or @username"
										autoComplete="username"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Field>
					<form.Field name="password">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Password</TextInput.Label>
								<TextInput.Password
									placeholder="At least 8 characters"
									autoComplete="current-password"
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
							<LastUsed show={lastUsed}>
								<Button
									type="submit"
									variant="solid"
									size="md"
									fullWidth
									loading={meta.isSubmitting}
									disabled={meta.isSubmitting || !meta.canSubmit}
								>
									Sign in
								</Button>
							</LastUsed>
							<FormError message={meta.formError} />
							<button
								type="button"
								onClick={() => onForgotPassword(form.values().identifier)}
								className={subtleLinkClass}
							>
								Forgot password?
							</button>
						</VStack>
					)}
				</form.Subscribe>
			</VStack>
		</form>
	)
}
