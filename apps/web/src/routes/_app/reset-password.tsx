import { resetPasswordFormSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { AuthModal } from "#/components/auth/auth-modal"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { TextInput } from "#/components/ui/text-input"
import { useGqlMutation } from "#/graphql/hooks"
import { ResetPasswordDocument } from "#/graphql/mutations/auth"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { rememberSignInMethod } from "#/lib/last-sign-in"
import { openModal } from "#/stores/modal-store"
import { showToast } from "#/stores/toast-store"

export const Route = createFileRoute("/_app/reset-password")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : "",
	}),
	head: () => ({
		meta: [
			{ title: "Reset password · Called My Shot" },
			{ name: "robots", content: "noindex" },
			// The token is in this page's URL, so it must not ride along in a
			// Referer header to anything the page loads or links to.
			{ name: "referrer", content: "no-referrer" },
		],
	}),
})

function RouteComponent() {
	const { token } = Route.useSearch()
	// Set once the server rejects the link, which only a fresh one fixes.
	const [linkError, setLinkError] = useState<string | null>(
		token ? null : "This reset link is missing its token.",
	)

	return (
		<VStack alignItems="center" justify="center" minHeight="60vh" gap="6">
			<Card size="lg">
				<Card.Body>
					{linkError ? (
						<LinkError message={linkError} />
					) : (
						<ResetForm token={token} onLinkError={setLinkError} />
					)}
				</Card.Body>
			</Card>
		</VStack>
	)
}

function LinkError({ message }: { message: string }) {
	return (
		<VStack alignItems="center" gap="3" textAlign="center">
			<h1 className={css({ fontFamily: "heading", fontSize: "xl" })}>
				Couldn't reset your password
			</h1>
			<p className={css({ fontSize: "sm", color: "fg.muted" })}>{message}</p>
			<Button
				type="button"
				variant="solid"
				size="sm"
				onClick={() => openModal(<AuthModal defaultView="forgot" />)}
			>
				Send a new link
			</Button>
		</VStack>
	)
}

function ResetForm({
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
					await navigate({ to: "/home", replace: true })
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
