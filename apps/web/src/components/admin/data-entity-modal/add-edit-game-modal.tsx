import { createGameSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import type {
	AdminGameRow,
	AdminTeamOption,
} from "#/components/admin/data-rows"
import { DateTimePicker } from "#/components/ui/date-time-picker"
import { FieldLabel } from "#/components/ui/field-label"
import { Select } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import {
	CreateGameDocument,
	invalidateAdminData,
	UpdateGameDocument,
} from "#/graphql/admin/data/mutations"
import { ApiError } from "#/graphql/api-error"
import { useGqlMutation } from "#/graphql/hooks"
import { toDateTimeLocal } from "#/lib/admin/data-entity"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"
import { EntityModalShell } from "./entity-modal-shell"

const gameStatusOptions = [
	{ value: "scheduled", label: "Scheduled" },
	{ value: "live", label: "Live" },
	{ value: "final", label: "Final" },
] as const

export function AddEditGameModal({
	leagueId,
	teams,
	game,
}: {
	leagueId: string
	teams: AdminTeamOption[]
	game?: AdminGameRow
}) {
	const queryClient = useQueryClient()
	const isEdit = !!game
	const createGame = useGqlMutation(CreateGameDocument)
	const updateGame = useGqlMutation(UpdateGameDocument)

	const form = useForm({
		schema: createGameSchema,
		defaultValues: {
			leagueId,
			homeTeamId: game?.homeTeam.id ?? "",
			awayTeamId: game?.awayTeam.id ?? "",
			startsAt: game ? toDateTimeLocal(game.startsAt) : "",
			status: (game?.status.toLowerCase() ?? "scheduled") as
				| "scheduled"
				| "live"
				| "final",
			homeScore: game?.homeScore ?? undefined,
			awayScore: game?.awayScore ?? undefined,
		},
		onSubmit: async (values, helpers) => {
			const wireValues = {
				...values,
				status: values.status.toUpperCase() as "SCHEDULED" | "LIVE" | "FINAL",
			}
			const result = isEdit
				? (
						await updateGame.mutateAsync({
							input: { id: game.id, ...wireValues },
						})
					)?.updateGame
				: (await createGame.mutateAsync({ input: wireValues }))?.createGame
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
				.with({ __typename: "Game" }, async () => {
					closeModal()
					await invalidateAdminData(queryClient)
				})
				.exhaustive()
		},
	})

	const status = form.useWatch("status")

	return (
		<form id="game-form" onSubmit={form.handleSubmit}>
			<form.Subscribe selector={(s) => s.meta}>
				{(meta) => (
					<EntityModalShell
						title={isEdit ? "Edit game" : "Add game"}
						formId="game-form"
						saving={meta.isSubmitting}
						canSave={meta.canSubmit}
						formError={meta.formError}
					>
						<HStack gap="3">
							<VStack gap="1" alignItems="stretch" className={css({ flex: 1 })}>
								<FieldLabel>Away team</FieldLabel>
								<form.Field name="awayTeamId">
									{(field) => (
										<Select value={field.value} onValueChange={field.onChange}>
											<Select.Trigger>
												{teams.find((t) => t.id === field.value)
													?.abbreviation ?? "Select…"}
											</Select.Trigger>
											<Select.Content>
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
							<VStack gap="1" alignItems="stretch" className={css({ flex: 1 })}>
								<FieldLabel>Home team</FieldLabel>
								<form.Field name="homeTeamId">
									{(field) => (
										<Select value={field.value} onValueChange={field.onChange}>
											<Select.Trigger>
												{teams.find((t) => t.id === field.value)
													?.abbreviation ?? "Select…"}
											</Select.Trigger>
											<Select.Content>
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
						</HStack>
						<VStack gap="1" alignItems="stretch">
							<FieldLabel required>Start time</FieldLabel>
							<form.Field name="startsAt">
								{(field) => (
									<DateTimePicker
										value={field.value}
										onValueChange={field.onChange}
										error={field.meta.error ?? undefined}
									/>
								)}
							</form.Field>
						</VStack>
						<VStack gap="1" alignItems="stretch">
							<FieldLabel>Status</FieldLabel>
							<form.Field name="status">
								{(field) => (
									<Select value={field.value} onValueChange={field.onChange}>
										<Select.Trigger>
											{
												gameStatusOptions.find((o) => o.value === field.value)
													?.label
											}
										</Select.Trigger>
										<Select.Content>
											{gameStatusOptions.map((o) => (
												<Select.Option key={o.value} value={o.value}>
													{o.label}
												</Select.Option>
											))}
										</Select.Content>
									</Select>
								)}
							</form.Field>
						</VStack>
						{status === "final" && (
							<HStack gap="3">
								<form.Field name="awayScore">
									{(field) => (
										<TextInput
											error={field.meta.error ?? undefined}
											className={css({ flex: 1 })}
										>
											<TextInput.Label required>Away score</TextInput.Label>
											<TextInput.Group>
												<TextInput.Field
													type="number"
													value={field.value ?? ""}
													onChange={(e) =>
														field.onChange(
															e.target.value === ""
																? undefined
																: Number(e.target.value),
														)
													}
													onBlur={field.onBlur}
												/>
											</TextInput.Group>
										</TextInput>
									)}
								</form.Field>
								<form.Field name="homeScore">
									{(field) => (
										<TextInput
											error={field.meta.error ?? undefined}
											className={css({ flex: 1 })}
										>
											<TextInput.Label required>Home score</TextInput.Label>
											<TextInput.Group>
												<TextInput.Field
													type="number"
													value={field.value ?? ""}
													onChange={(e) =>
														field.onChange(
															e.target.value === ""
																? undefined
																: Number(e.target.value),
														)
													}
													onBlur={field.onBlur}
												/>
											</TextInput.Group>
										</TextInput>
									)}
								</form.Field>
							</HStack>
						)}
					</EntityModalShell>
				)}
			</form.Subscribe>
		</form>
	)
}
