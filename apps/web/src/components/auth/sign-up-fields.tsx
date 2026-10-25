import { signUpSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { TextInput } from "#/components/ui/text-input"
import { SignUpDocument } from "#/graphql/auth/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { rememberSignInMethod } from "#/lib/last-sign-in"
import { markGuestPicksEntry } from "#/stores/guest-picks-store"
import { closeModal } from "#/stores/modal-store"
import { clearReferral, readReferral } from "#/stores/referral-store"
import { showToast } from "#/stores/toast-store"
import { InviteCodeField } from "./invite-code-field"
import type { FieldsProps } from "./types"

// How long after the post-signup navigation the welcome toast waits. Long
// enough for the destination to have mounted, so the toast lands on the page
// the new account is actually looking at rather than on the one dissolving
// behind it.
const TOAST_AFTER_NAV_MS = 400

export function SignUpFields({ onSuccess, surface }: FieldsProps) {
	const signUp = useGqlMutation(SignUpDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	// Whatever /join/:code captured, if this browser is the one that opened
	// the link. Applied as-is with no field shown: the link already said whose
	// invite this is, and a prefilled box only invites someone to wonder
	// whether they're meant to change it.
	const [captured] = useState(readReferral)

	const form = useForm({
		schema: signUpSchema,
		defaultValues: {
			name: "",
			username: "",
			email: "",
			password: "",
			referralCode: captured?.code ?? "",
		},
		onSubmit: async (values, helpers) => {
			const referralSource = captured
				? captured.source
				: values.referralCode
					? "manual_code"
					: null

			const data = await signUp.mutateAsync({
				input: {
					...values,
					referralSource: match(referralSource)
						.with("invite_link", () => "INVITE_LINK" as const)
						.with("manual_code", () => "MANUAL_CODE" as const)
						.with(null, () => null)
						.exhaustive(),
				},
			})
			const result = data?.signUp

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
				.with({ __typename: "AuthPayload" }, async (r) => {
					track("user_signed_up", { method: "email", surface, referralSource })
					rememberSignInMethod("email")
					if (values.referralCode) {
						track("referral_code_entered", { prefilled: Boolean(captured) })
					}
					// Spent. A second account made in this browser shouldn't be
					// credited to the same person again.
					clearReferral()
					markGuestPicksEntry("signup")
					queryClient.clear()
					await router.invalidate()
					closeModal()
					if (onSuccess) onSuccess()
					else await navigate({ to: "/" })

					// After the navigation, and a beat behind it. This is the
					// one moment the account is told it already owns a redo -
					// the grant is silent in the database and the invitee gets
					// no notification - and a toast queued before the route
					// swaps spends most of its few seconds on the page they are
					// leaving. Fired off the server's answer rather than off
					// "they typed a code", since a code that matched nothing
					// grants nothing.
					if (r.redoGranted) {
						setTimeout(() => {
							showToast({
								message:
									"You've got a redo. It can change one call before that question locks.",
								// The hash opens the Redos section rather than
								// landing them on a closed accordion header, the
								// same way the resolution link works.
								action: {
									label: "What's a redo?",
									to: "/how-it-works",
									hash: "redos",
								},
							})
						}, TOAST_AFTER_NAV_MS)
					}
				})
				.exhaustive()
		},
	})

	return (
		<form onSubmit={form.handleSubmit}>
			<VStack gap="5" alignItems="stretch">
				<VStack gap="3.5" alignItems="stretch">
					<form.Field name="name">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Name</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										type="text"
										placeholder="Full name"
										autoComplete="name"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Field>
					<form.Field name="username">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Username</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										type="text"
										placeholder="@yourusername"
										autoComplete="username"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Field>
					<form.Field name="email">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Email</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										type="email"
										placeholder="you@email.com"
										autoComplete="email"
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
									autoComplete="new-password"
									value={field.value}
									onChange={field.onChange}
									onBlur={field.onBlur}
								/>
							</TextInput>
						)}
					</form.Field>
					{/* Only when no link captured a code: it's for the person
					whose friend read a code out to them, which is the case a
					link can't serve. */}
					{!captured && (
						<form.Field name="referralCode">
							{(field) => (
								<InviteCodeField
									value={field.value ?? ""}
									onChange={field.onChange}
									onBlur={field.onBlur}
									error={field.meta.error ?? undefined}
								/>
							)}
						</form.Field>
					)}
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
								Create account
							</Button>
							<FormError message={meta.formError} />
							<p
								className={css({
									textStyle: "metaSm",
									color: "fg.subtle",
									textAlign: "center",
								})}
							>
								No money, ever. Points are pure reputation.
							</p>
						</VStack>
					)}
				</form.Subscribe>
			</VStack>
		</form>
	)
}
