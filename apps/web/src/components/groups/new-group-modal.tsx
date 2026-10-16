import {
	createGroupSchema,
	GROUP_DESCRIPTION_MAX,
} from "@called-my-shot/schemas"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { useCreateGroupFlow } from "#/hooks/use-create-group-flow"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"
import { Button } from "../ui/button"
import { FieldHint } from "../ui/field-hint"
import { FieldLabel } from "../ui/field-label"
import { FormError } from "../ui/form-error"
import { Modal } from "../ui/modal"
import { TextInput } from "../ui/text-input"
import { Textarea } from "../ui/textarea"
import { TrackedLeaguesPicker } from "./tracked-leagues-picker"

type Props = {
	// From _app's router context, passed in because ModalHost renders at the
	// root, outside the route that loads them.
	leagues: { id: string; abbreviation: string }[]
}

export function NewGroupModal({ leagues }: Props) {
	const { createGroup } = useCreateGroupFlow()

	const form = useForm({
		defaultValues: {
			name: "",
			description: "",
			leagueIds: [] as string[],
		},
		schema: createGroupSchema,
		onSubmit: async (values, helpers) => {
			const result = await createGroup(values, "in_app")

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
					helpers.setFormError("You need to sign in to create a group.")
				})
				// Already moved to the group by the flow.
				.with({ __typename: "GroupPayload" }, async () => {
					closeModal()
				})
				.exhaustive()
		},
	})
	return (
		<Modal>
			<Modal.CloseButton />
			<VStack gap="1" alignItems="flex-start">
				<Modal.Title>Create a group</Modal.Title>
				<Modal.Description>
					Invite friends by link and compare real points against people you
					actually know.
				</Modal.Description>
			</VStack>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="3.5" alignItems="stretch">
					<form.Field name="name">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Group name</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										placeholder="e.g. Wolfpack"
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
									Only these leagues count toward the leaderboard and show up in
									the group's activity.
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
									Create Group
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
