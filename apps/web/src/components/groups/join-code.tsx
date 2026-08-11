import { useMutation } from "@apollo/client/react"
import { joinGroupSchema } from "@called-my-shot/schemas"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { JoinGroupByCodeDocument } from "#/graphql/generated/graphql"
import { useForm } from "#/lib/form/use-form"
import { Button } from "../ui/button"
import { FormError } from "../ui/form-error"
import { TextInput } from "../ui/text-input"

export function JoinCode() {
	const [joinGroupByCode] = useMutation(JoinGroupByCodeDocument)
	const router = useRouter()
	const navigate = useNavigate()

	const form = useForm({
		schema: joinGroupSchema,
		defaultValues: {
			code: "",
		},
		onSubmit: async (values, helpers) => {
			const { data } = await joinGroupByCode({ variables: { input: values } })
			const result = data?.joinGroupByCode

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
					helpers.setFormError("You need to sign in to join a group.")
				})
				.with({ __typename: "NotFoundError" }, async () => {
					helpers.setFormError("This invite code is invalid or has expired.")
				})
				.with({ __typename: "GroupPayload" }, async (r) => {
					await router.invalidate()
					await navigate({
						to: "/groups/$groupId",
						params: { groupId: r.group.id },
					})
				})
				.exhaustive()
		},
	})

	return (
		<form onSubmit={form.handleSubmit}>
			<VStack gap="2" alignItems="stretch">
				<form.Field name="code">
					{(field) => (
						<HStack gap="4">
							<TextInput
								className={css({ flex: 1 })}
								error={field.meta.error ?? undefined}
							>
								<TextInput.Group>
									<TextInput.Field
										placeholder="Enter invite code"
										type="text"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
							<form.Subscribe selector={(s) => s.meta}>
								{(meta) => (
									<Button
										type="submit"
										variant="white"
										loading={meta.isSubmitting}
										disabled={meta.isSubmitting || !meta.canSubmit}
									>
										Join
									</Button>
								)}
							</form.Subscribe>
						</HStack>
					)}
				</form.Field>
				<form.Subscribe selector={(s) => s.meta}>
					{(meta) => <FormError message={meta.formError} />}
				</form.Subscribe>
			</VStack>
		</form>
	)
}
