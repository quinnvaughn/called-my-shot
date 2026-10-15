import { createTeamSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { match } from "ts-pattern"
import type { AdminTeamRow } from "#/components/admin/data-rows"
import { TextInput } from "#/components/ui/text-input"
import {
	CreateTeamDocument,
	invalidateAdminData,
	UpdateTeamDocument,
} from "#/graphql/admin/data/mutations"
import { ApiError } from "#/graphql/api-error"
import { useGqlMutation } from "#/graphql/hooks"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"
import { EntityModalShell } from "./entity-modal-shell"

export function AddEditTeamModal({
	leagueId,
	team,
}: {
	leagueId: string
	team?: AdminTeamRow
}) {
	const queryClient = useQueryClient()
	const isEdit = !!team
	const createTeam = useGqlMutation(CreateTeamDocument)
	const updateTeam = useGqlMutation(UpdateTeamDocument)

	const form = useForm({
		schema: createTeamSchema,
		defaultValues: {
			leagueId,
			name: team?.name ?? "",
			abbreviation: team?.abbreviation ?? "",
			color: team?.color ?? "",
			conference: team?.conference ?? "",
			division: team?.division ?? "",
		},
		onSubmit: async (values, helpers) => {
			const result = isEdit
				? (await updateTeam.mutateAsync({ input: { id: team.id, ...values } }))
						?.updateTeam
				: (await createTeam.mutateAsync({ input: values }))?.createTeam
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
				.with({ __typename: "Team" }, async () => {
					closeModal()
					await invalidateAdminData(queryClient)
				})
				.exhaustive()
		},
	})

	return (
		<form id="team-form" onSubmit={form.handleSubmit}>
			<form.Subscribe selector={(s) => s.meta}>
				{(meta) => (
					<EntityModalShell
						title={isEdit ? "Edit team" : "Add team"}
						formId="team-form"
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
											placeholder="Boston Celtics"
										/>
									</TextInput.Group>
								</TextInput>
							)}
						</form.Field>
						<form.Field name="abbreviation">
							{(field) => (
								<TextInput error={field.meta.error ?? undefined}>
									<TextInput.Label required>Abbreviation</TextInput.Label>
									<TextInput.Group>
										<TextInput.Field
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
											placeholder="BOS"
										/>
									</TextInput.Group>
								</TextInput>
							)}
						</form.Field>
						<form.Field name="color">
							{(field) => {
								const isValidHex = /^#[0-9a-fA-F]{6}$/.test(field.value)
								return (
									<TextInput error={field.meta.error ?? undefined}>
										<TextInput.Label required>Team color</TextInput.Label>
										<TextInput.Group>
											<input
												type="color"
												aria-label="Pick team color"
												value={isValidHex ? field.value : "#000000"}
												onChange={field.onChange}
												className={css({
													flexShrink: "0",
													width: "7",
													height: "7",
													padding: "0",
													border: "1px solid {colors.border.default}",
													borderRadius: "md",
													cursor: "pointer",
													backgroundColor: "transparent",
													"&::-webkit-color-swatch-wrapper": { padding: "0" },
													"&::-webkit-color-swatch": {
														border: "none",
														borderRadius: "inherit",
													},
													"&::-moz-color-swatch": {
														border: "none",
														borderRadius: "inherit",
													},
												})}
											/>
											<TextInput.Field
												value={field.value}
												onChange={field.onChange}
												onBlur={field.onBlur}
												placeholder="#007A33"
											/>
										</TextInput.Group>
									</TextInput>
								)
							}}
						</form.Field>
						<form.Field name="conference">
							{(field) => (
								<TextInput error={field.meta.error ?? undefined}>
									<TextInput.Label>Conference</TextInput.Label>
									<TextInput.Group>
										<TextInput.Field
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
											placeholder="AL, AFC, Eastern - sync-populated, hand-edit if wrong"
										/>
									</TextInput.Group>
								</TextInput>
							)}
						</form.Field>
						<form.Field name="division">
							{(field) => (
								<TextInput error={field.meta.error ?? undefined}>
									<TextInput.Label>Division</TextInput.Label>
									<TextInput.Group>
										<TextInput.Field
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
											placeholder="East, Atlantic - sync-populated, hand-edit if wrong"
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
