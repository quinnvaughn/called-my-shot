import { requestEmailChangeSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { z } from "zod"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { TextInput } from "#/components/ui/text-input"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryPrefix } from "#/graphql/query-options"
import {
	CancelEmailChangeDocument,
	RequestEmailChangeDocument,
	ResendEmailChangeDocument,
} from "#/graphql/user/settings/mutations"
import { SettingsPageDocument } from "#/graphql/user/settings/queries"
import { useForm } from "#/lib/form/use-form"
import { CurrentEmailRow } from "./current-email-row"

type Props = {
	email: string
	emailVerified: boolean
	pendingEmailChange: { newEmail: string; expiresAt: string } | null
	// False for an account made through Google, which has no password to
	// confirm the change with.
	hasPassword: boolean
}

export function EmailSection({
	email,
	emailVerified,
	pendingEmailChange,
	hasPassword,
}: Props) {
	const requestEmailChange = useGqlMutation(RequestEmailChangeDocument)
	const resendEmailChange = useGqlMutation(ResendEmailChangeDocument)
	const cancelEmailChange = useGqlMutation(CancelEmailChangeDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const [resent, setResent] = useState(false)
	const [pendingActionError, setPendingActionError] = useState<string | null>(
		null,
	)

	const schema = hasPassword
		? requestEmailChangeSchema
		: requestEmailChangeSchema.extend({ password: z.string() })

	const form = useForm({
		defaultValues: { newEmail: "", password: "" },
		schema,
		onSubmit: async (values, helpers) => {
			const data = await requestEmailChange.mutateAsync({
				input: hasPassword ? values : { newEmail: values.newEmail },
			})
			const result = data?.requestEmailChange

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
					await queryClient.invalidateQueries({
						queryKey: gqlQueryPrefix(SettingsPageDocument),
					})
					await router.invalidate()
				})
				.exhaustive()
		},
	})

	async function handleResend() {
		setPendingActionError(null)
		const data = await resendEmailChange.mutateAsync({ redirectTo: "/settings" })
		if (data?.resendEmailChange?.__typename !== "User") {
			setPendingActionError("Couldn't resend. Try again.")
			return
		}
		await queryClient.invalidateQueries({
			queryKey: gqlQueryPrefix(SettingsPageDocument),
		})
		await router.invalidate()
		setResent(true)
		setTimeout(() => setResent(false), 1500)
	}

	async function handleCancel() {
		setPendingActionError(null)
		await cancelEmailChange.mutateAsync()
		await queryClient.invalidateQueries({
			queryKey: gqlQueryPrefix(SettingsPageDocument),
		})
		await router.invalidate()
	}

	if (pendingEmailChange) {
		return (
			<Card>
				<Card.Body>
					<VStack gap="4" alignItems="stretch">
						<CurrentEmailRow email={email} emailVerified={emailVerified} />
						<div
							className={css({
								bg: "bg.subtle",
								border: "1px solid {colors.border.default}",
								borderRadius: "xl",
								padding: "3.5",
							})}
						>
							<p className={css({ fontSize: "xs", lineHeight: "relaxed" })}>
								Verification sent to{" "}
								<b className={css({ fontWeight: "semibold" })}>
									{pendingEmailChange.newEmail}
								</b>
								. Your email stays{" "}
								<b className={css({ fontWeight: "semibold" })}>{email}</b> until
								you confirm it.
							</p>
						</div>
						<FormError message={pendingActionError} />
					</VStack>
				</Card.Body>
				<Card.Footer>
					<HStack justify="flex-end" gap="2" width="full">
						<Button variant="ghost" size="sm" onClick={handleResend}>
							{resent ? "Sent" : "Resend"}
						</Button>
						<Button variant="ghost" size="sm" onClick={handleCancel}>
							Cancel
						</Button>
					</HStack>
				</Card.Footer>
			</Card>
		)
	}

	return (
		<Card>
			<Card.Body>
				<VStack gap="4" alignItems="stretch">
					<CurrentEmailRow email={email} emailVerified={emailVerified} />
					<form onSubmit={form.handleSubmit} id="email-form">
						<VStack gap="3.5" alignItems="stretch">
							<form.Field name="newEmail">
								{(field) => (
									<TextInput error={field.meta.error ?? undefined}>
										<TextInput.Label>New email</TextInput.Label>
										<TextInput.Group>
											<TextInput.Field
												type="email"
												autoComplete="off"
												placeholder="Enter a new email address"
												value={field.value}
												onChange={field.onChange}
												onBlur={field.onBlur}
											/>
										</TextInput.Group>
									</TextInput>
								)}
							</form.Field>
							{hasPassword && (
								<form.Field name="password">
									{(field) => (
										<TextInput
											error={field.meta.error ?? undefined}
											description="Changing your email requires your password."
										>
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
						</VStack>
					</form>
				</VStack>
			</Card.Body>
			<Card.Footer>
				<form.Subscribe selector={(s) => s.meta}>
					{(meta) => (
						<HStack justify="flex-end" alignItems="center" gap="3" width="full">
							<FormError message={meta.formError} />
							<Button
								type="submit"
								form="email-form"
								variant="solid"
								size="sm"
								loading={meta.isSubmitting}
								disabled={meta.isSubmitting || !meta.canSubmit}
							>
								Send verification
							</Button>
						</HStack>
					)}
				</form.Subscribe>
			</Card.Footer>
		</Card>
	)
}
