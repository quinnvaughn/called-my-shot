import {
	createGroupSchema,
	GROUP_DESCRIPTION_MAX,
} from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { SaveNote } from "#/components/ui/save-note"
import { TextInput } from "#/components/ui/text-input"
import { Textarea } from "#/components/ui/textarea"
import { UpdateGroupDocument } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { useForm } from "#/lib/form/use-form"
import { TrackedLeaguesPicker } from "./tracked-leagues-picker"

type Props = {
	groupId: string
	groupName: string
	groupDescription: string | null
	leagues: { id: string; abbreviation: string }[]
	trackedLeagueIds: string[]
}

// Admins only - the settings page only renders it for them, and updateGroup
// refuses anyone else. The same fields as creating a group, under the same
// rules, so it validates against createGroupSchema.
export function GroupGeneralSection({
	groupId,
	groupName,
	groupDescription,
	leagues,
	trackedLeagueIds,
}: Props) {
	const updateGroup = useGqlMutation(UpdateGroupDocument)
	const queryClient = useQueryClient()
	const router = useRouter()
	const [savedNote, setSavedNote] = useState<string | null>(null)

	const form = useForm({
		defaultValues: {
			name: groupName,
			description: groupDescription ?? "",
			leagueIds: trackedLeagueIds,
		},
		schema: createGroupSchema,
		onSubmit: async (values, helpers) => {
			const data = await updateGroup.mutateAsync({
				// Always sent, even blank - updateGroup saves the whole form, and a
				// blank description is how an admin clears it.
				input: { groupId, ...values, description: values.description ?? "" },
			})
			const result = data?.updateGroup

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
				.with(
					{ __typename: "AuthenticationError" },
					{ __typename: "AuthorizationError" },
					{ __typename: "NotFoundError" },
					async (r) => {
						helpers.setFormError(r.message)
					},
				)
				.with({ __typename: "GroupPayload" }, async () => {
					await queryClient.invalidateQueries()
					await router.invalidate()
					setSavedNote("Saved")
					setTimeout(() => setSavedNote(null), 2000)
				})
				.exhaustive()
		},
	})

	return (
		<Card>
			<Card.Body>
				<form onSubmit={form.handleSubmit} id="group-general-form">
					<VStack gap="4" alignItems="stretch">
						<form.Field name="name">
							{(field) => (
								<TextInput error={field.meta.error ?? undefined}>
									<TextInput.Label>Group name</TextInput.Label>
									<TextInput.Group>
										<TextInput.Field
											type="text"
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
										/>
									</TextInput.Group>
								</TextInput>
							)}
						</form.Field>
						<form.Field name="description">
							{(field) => (
								<Textarea
									error={field.meta.error ?? undefined}
									description="Shows on your invite link, so people know what they're joining."
								>
									<Textarea.Label>Description</Textarea.Label>
									<Textarea.Field
										placeholder="e.g. Bragging rights for the group chat"
										maxLength={GROUP_DESCRIPTION_MAX}
										rows={2}
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
									<Textarea.CharCount
										value={field.value ?? ""}
										max={GROUP_DESCRIPTION_MAX}
									/>
								</Textarea>
							)}
						</form.Field>
						<form.Field name="leagueIds">
							{(field) => (
								<VStack gap="2" alignItems="stretch">
									<FieldLabel>Tracked leagues</FieldLabel>
									<TrackedLeaguesPicker
										leagues={leagues}
										value={field.value}
										onChange={field.onChange}
									/>
									<FieldHint>
										Only these leagues count toward the leaderboard and show up
										in the group's activity.
									</FieldHint>
								</VStack>
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
								form="group-general-form"
								variant="solid"
								size="sm"
								loading={meta.isSubmitting}
								disabled={meta.isSubmitting || !meta.canSubmit}
							>
								Save
							</Button>
						</HStack>
					)}
				</form.Subscribe>
			</Card.Footer>
		</Card>
	)
}
