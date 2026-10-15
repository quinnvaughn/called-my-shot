import { requestPasswordResetSchema } from "@called-my-shot/schemas"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { RequestPasswordResetDocument } from "#/graphql/auth/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { subtleLinkClass } from "./styles"

// Swaps itself for a "check your email" note once sent. The server answers
// the same whether or not the email has an account, so the note can't say
// which it was either.
export function ForgotPasswordFields({
	title,
	description,
	defaultEmail,
	onBack,
}: {
	title: string
	description: string
	defaultEmail: string
	onBack: () => void
}) {
	const requestReset = useGqlMutation(RequestPasswordResetDocument)
	const [sentTo, setSentTo] = useState<string | null>(null)

	const form = useForm({
		schema: requestPasswordResetSchema,
		defaultValues: { email: defaultEmail },
		onSubmit: async (values, helpers) => {
			const data = await requestReset.mutateAsync({ input: values })
			const result = data?.requestPasswordReset

			if (!result) {
				helpers.setFormError("Something went wrong. Try again.")
				return
			}

			match(result)
				.with({ __typename: "ValidationError" }, (r) => {
					const errors: Record<string, string | null> = {}
					for (const fieldError of r.fieldErrors ?? []) {
						if (fieldError.field) errors[fieldError.field] = fieldError.message
						else helpers.setFormError(fieldError.message)
					}
					helpers.setErrors(errors)
				})
				.with({ __typename: "MutationRequestPasswordResetSuccess" }, () => {
					track("password_reset_requested", {})
					setSentTo(values.email)
				})
				.exhaustive()
		},
	})

	const backButton = (
		<button type="button" onClick={onBack} className={subtleLinkClass}>
			Back to sign in
		</button>
	)

	if (sentTo) {
		return (
			<VStack gap="5" alignItems="stretch">
				<VStack gap="1" alignItems="flex-start">
					<Modal.Title>Check your email</Modal.Title>
					<Modal.Description>
						If an account uses {sentTo}, we sent it a link to reset your
						password. The link expires in 1 hour.
					</Modal.Description>
				</VStack>
				{backButton}
			</VStack>
		)
	}

	return (
		<VStack gap="5" alignItems="stretch">
			<VStack gap="1" alignItems="flex-start">
				<Modal.Title>{title}</Modal.Title>
				<Modal.Description>{description}</Modal.Description>
			</VStack>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="5" alignItems="stretch">
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
									Send reset link
								</Button>
								<FormError message={meta.formError} />
								{backButton}
							</VStack>
						)}
					</form.Subscribe>
				</VStack>
			</form>
		</VStack>
	)
}
