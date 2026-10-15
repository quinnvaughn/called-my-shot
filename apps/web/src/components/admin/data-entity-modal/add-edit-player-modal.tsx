import { createPlayerSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import type {
	AdminPlayerRow,
	AdminTeamOption,
} from "#/components/admin/data-rows"
import { FieldLabel } from "#/components/ui/field-label"
import { Select } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import {
	CreatePlayerDocument,
	invalidateAdminData,
	UpdatePlayerDocument,
} from "#/graphql/admin/data/mutations"
import { ApiError } from "#/graphql/api-error"
import { useGqlMutation } from "#/graphql/hooks"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"
import { EntityModalShell } from "./entity-modal-shell"

export function AddEditPlayerModal({
	teams,
	player,
}: {
	teams: AdminTeamOption[]
	player?: AdminPlayerRow
}) {
	const queryClient = useQueryClient()
	const isEdit = !!player
	const createPlayer = useGqlMutation(CreatePlayerDocument)
	const updatePlayer = useGqlMutation(UpdatePlayerDocument)

	const form = useForm({
		schema: createPlayerSchema,
		defaultValues: {
			currentTeamId: player?.currentTeam?.id,
			name: player?.name ?? "",
			position: player?.position ?? "",
		},
		onSubmit: async (values, helpers) => {
			const result = isEdit
				? (
						await updatePlayer.mutateAsync({
							input: { id: player.id, ...values },
						})
					)?.updatePlayer
				: (await createPlayer.mutateAsync({ input: values }))?.createPlayer
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
				.with(ApiError, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "Player" }, async () => {
					closeModal()
					await invalidateAdminData(queryClient)
				})
				.exhaustive()
		},
	})

	return (
		<form id="player-form" onSubmit={form.handleSubmit}>
			<form.Subscribe selector={(s) => s.meta}>
				{(meta) => (
					<EntityModalShell
						title={isEdit ? "Edit player" : "Add player"}
						formId="player-form"
						saving={meta.isSubmitting}
						canSave={meta.canSubmit}
						formError={meta.formError}
					>
						<form.Field name="name">
							{(field) => (
								<TextInput error={field.meta.error ?? undefined}>
									<TextInput.Label required>Name</TextInput.Label>
									<TextInput.Group>
										<TextInput.Field
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
											placeholder="Nikola Jokić"
										/>
									</TextInput.Group>
								</TextInput>
							)}
						</form.Field>
						<VStack gap="1" alignItems="stretch">
							<FieldLabel>Team</FieldLabel>
							<form.Field name="currentTeamId">
								{(field) => (
									<Select
										value={field.value ?? ""}
										onValueChange={(v) => field.onChange(v || undefined)}
									>
										<Select.Trigger>
											{teams.find((t) => t.id === field.value)?.name ??
												"Free agent / none"}
										</Select.Trigger>
										<Select.Content>
											<Select.Option value="">Free agent / none</Select.Option>
											{teams.map((t) => (
												<Select.Option key={t.id} value={t.id}>
													{t.name}
												</Select.Option>
											))}
										</Select.Content>
									</Select>
								)}
							</form.Field>
						</VStack>
						<form.Field name="position">
							{(field) => (
								<TextInput error={field.meta.error ?? undefined}>
									<TextInput.Label>Position</TextInput.Label>
									<TextInput.Group>
										<TextInput.Field
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
											placeholder="C, F, G…"
										/>
									</TextInput.Group>
								</TextInput>
							)}
						</form.Field>
					</EntityModalShell>
				)}
			</form.Subscribe>
		</form>
	)
}
