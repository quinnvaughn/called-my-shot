import { createGroupSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { UpdateGroupDocument } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"
import { Button } from "../ui/button"
import { FieldHint } from "../ui/field-hint"
import { FieldLabel } from "../ui/field-label"
import { FormError } from "../ui/form-error"
import { Modal } from "../ui/modal"
import { TextInput } from "../ui/text-input"
import { TrackedLeaguesPicker } from "./tracked-leagues-picker"

type Props = {
	groupId: string
	groupName: string
	leagues: { id: string; abbreviation: string }[]
	trackedLeagueIds: string[]
}

// Admins only - the group page only offers it to them, and updateGroup
// refuses anyone else. The same two fields as creating a group, under the
// same rules, so it validates against createGroupSchema.
export function GroupSettingsModal({
	groupId,
	groupName,
	leagues,
	trackedLeagueIds,
}: Props) {
	const updateGroup = useGqlMutation(UpdateGroupDocument)
	const queryClient = useQueryClient()
	const router = useRouter()

	const form = useForm({
		defaultValues: {
			name: groupName,
			leagueIds: trackedLeagueIds,
		},
		schema: createGroupSchema,
		onSubmit: async (values, helpers) => {
			const data = await updateGroup.mutateAsync({
				input: { groupId, ...values },
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
					closeModal()
				})
				.exhaustive()
		},
	})

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Group settings</Modal.Title>
			<form onSubmit={form.handleSubmit}>
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
									Save
								</Button>
								<FormError message={meta.formError} />
							</VStack>
						)}
					</form.Subscribe>
				</VStack>
			</form>
		</Modal>
	)
}
