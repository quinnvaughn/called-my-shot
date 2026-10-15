import { createLeagueSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import type { AdminLeagueRow } from "#/components/admin/data-rows"
import { FieldLabel } from "#/components/ui/field-label"
import { Select } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import {
	CreateLeagueDocument,
	invalidateAdminData,
	UpdateLeagueDocument,
} from "#/graphql/admin/data/mutations"
import { ApiError } from "#/graphql/api-error"
import { useGqlMutation } from "#/graphql/hooks"
import { statusOptionLabel } from "#/lib/admin/data-entity"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"
import { EntityModalShell } from "./entity-modal-shell"

export function AddEditLeagueModal({
	sports,
	league,
}: {
	sports: { id: string; name: string }[]
	league?: AdminLeagueRow
}) {
	const queryClient = useQueryClient()
	const isEdit = !!league
	const createLeague = useGqlMutation(CreateLeagueDocument)
	const updateLeague = useGqlMutation(UpdateLeagueDocument)

	const form = useForm({
		schema: createLeagueSchema,
		defaultValues: {
			sportId: league?.sport.id ?? sports[0]?.id ?? "",
			name: league?.name ?? "",
			abbreviation: league?.abbreviation ?? "",
			slug: league?.slug ?? "",
			status: (league?.status.toLowerCase() ?? "active") as
				| "active"
				| "inactive",
		},
		onSubmit: async (values, helpers) => {
			const wireValues = {
				...values,
				status: values.status.toUpperCase() as "ACTIVE" | "INACTIVE",
			}
			const result = isEdit
				? (
						await updateLeague.mutateAsync({
							input: { id: league.id, ...wireValues },
						})
					)?.updateLeague
				: (await createLeague.mutateAsync({ input: wireValues }))?.createLeague
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
				.with({ __typename: "League" }, async () => {
					closeModal()
					await invalidateAdminData(queryClient)
				})
				.exhaustive()
		},
	})

	return (
		<form id="league-form" onSubmit={form.handleSubmit}>
			<form.Subscribe selector={(s) => s.meta}>
				{(meta) => (
					<EntityModalShell
						title={isEdit ? "Edit league" : "Add league"}
						formId="league-form"
						saving={meta.isSubmitting}
						canSave={meta.canSubmit}
						formError={meta.formError}
					>
						<VStack gap="1" alignItems="stretch">
							<FieldLabel>Sport</FieldLabel>
							<form.Field name="sportId">
								{(field) => (
									<Select value={field.value} onValueChange={field.onChange}>
										<Select.Trigger>
											{sports.find((s) => s.id === field.value)?.name ??
												"Select a sport…"}
										</Select.Trigger>
										<Select.Content>
											{sports.map((s) => (
												<Select.Option key={s.id} value={s.id}>
													{s.name}
												</Select.Option>
											))}
										</Select.Content>
									</Select>
								)}
							</form.Field>
						</VStack>
						<form.Field name="name">
							{(field) => (
								<TextInput error={field.meta.error ?? undefined}>
									<TextInput.Label required>Name</TextInput.Label>
									<TextInput.Group>
										<TextInput.Field
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
											placeholder="NBA"
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
											placeholder="NBA"
										/>
									</TextInput.Group>
								</TextInput>
							)}
						</form.Field>
						<form.Field name="slug">
							{(field) => (
								<TextInput error={field.meta.error ?? undefined}>
									<TextInput.Label required>Slug</TextInput.Label>
									<TextInput.Group>
										<TextInput.Field
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
											placeholder="nba"
										/>
									</TextInput.Group>
								</TextInput>
							)}
						</form.Field>
						<VStack gap="1" alignItems="stretch">
							<FieldLabel>Status</FieldLabel>
							<form.Field name="status">
								{(field) => (
									<Select
										value={field.value ?? "active"}
										onValueChange={field.onChange}
									>
										<Select.Trigger>
											{statusOptionLabel(field.value ?? "active")}
										</Select.Trigger>
										<Select.Content>
											<Select.Option value="active">Active</Select.Option>
											<Select.Option value="inactive">
												Coming soon
											</Select.Option>
										</Select.Content>
									</Select>
								)}
							</form.Field>
						</VStack>
					</EntityModalShell>
				)}
			</form.Subscribe>
		</form>
	)
}
