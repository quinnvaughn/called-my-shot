import { useMutation, useQuery } from "@apollo/client/react"
import { updateUsernameSchema } from "@called-my-shot/schemas"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { SaveNote } from "#/components/ui/save-note"
import { TextInput } from "#/components/ui/text-input"
import {
	UpdateUsernameDocument,
	UsernameAvailableDocument,
} from "#/graphql/queries/user"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { useForm } from "#/lib/form/use-form"

type Props = {
	username: string
}

export function UsernameSection({ username: currentUsername }: Props) {
	const [updateUsername] = useMutation(UpdateUsernameDocument)
	const router = useRouter()
	const [savedNote, setSavedNote] = useState<string | null>(null)

	const form = useForm({
		defaultValues: { username: currentUsername },
		schema: updateUsernameSchema,
		onSubmit: async (values, helpers) => {
			const { data } = await updateUsername({ variables: { input: values } })
			const result = data?.updateUsername

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
					await router.invalidate()
					setSavedNote("Saved")
					setTimeout(() => setSavedNote(null), 2000)
				})
				.exhaustive()
		},
	})

	// Own parse of the debounced value rather than reading the form's live
	// error state - the form re-validates on every keystroke (for the error
	// message under the field), but the availability check should only fire
	// once typing settles and only once the format is already valid.
	const username = form.useWatch("username")
	const debouncedUsername = useDebouncedValue(username, 400)
	const normalized = debouncedUsername.trim().toLowerCase()
	const isUnchanged = normalized === currentUsername.toLowerCase()
	const formatValid = updateUsernameSchema.safeParse({
		username: debouncedUsername,
	}).success
	const showStatus = !isUnchanged && formatValid

	const { data: availabilityData, loading: checking } = useQuery(
		UsernameAvailableDocument,
		{
			variables: { username: normalized },
			skip: !showStatus,
		},
	)
	const isAvailable = availabilityData?.usernameAvailable ?? null
	const canSave = showStatus && !checking && isAvailable === true

	return (
		<Card>
			<Card.Body>
				<form onSubmit={form.handleSubmit} id="username-form">
					<VStack gap="2" alignItems="stretch">
						<form.Field name="username">
							{(field) => (
								<TextInput error={field.meta.error ?? undefined}>
									<TextInput.Label>Username</TextInput.Label>
									<TextInput.Group>
										<span
											className={css({
												paddingLeft: "3",
												color: "fg.muted",
												fontFamily: "mono",
											})}
										>
											@
										</span>
										<TextInput.Field
											type="text"
											autoComplete="off"
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
										/>
									</TextInput.Group>
								</TextInput>
							)}
						</form.Field>
						{showStatus && (
							<p
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									color: checking
										? "fg.muted"
										: isAvailable
											? "success.default"
											: "danger.default",
								})}
							>
								{checking
									? "checking availability…"
									: isAvailable
										? "available"
										: `@${normalized} is taken`}
							</p>
						)}
						{!showStatus && (
							<p className={css({ fontSize: "xs", color: "fg.muted" })}>
								This is your public handle across Called My Shot.
							</p>
						)}
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
								form="username-form"
								variant="solid"
								size="sm"
								loading={meta.isSubmitting}
								disabled={meta.isSubmitting || !canSave}
							>
								Save username
							</Button>
						</HStack>
					)}
				</form.Subscribe>
			</Card.Footer>
		</Card>
	)
}
