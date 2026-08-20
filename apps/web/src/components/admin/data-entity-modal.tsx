import { useMutation } from "@apollo/client/react"
import {
	createGameSchema,
	createLeagueSchema,
	createPlayerSchema,
	createTeamSchema,
} from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { DateTimePicker } from "#/components/ui/date-time-picker"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { Select } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import {
	CreateGameDocument,
	CreateLeagueDocument,
	CreatePlayerDocument,
	CreateTeamDocument,
	UpdateGameDocument,
	UpdateLeagueDocument,
	UpdatePlayerDocument,
	UpdateTeamDocument,
} from "#/graphql/mutations/admin"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"

type LeagueRow = {
	id: string
	name: string
	abbreviation: string
	slug: string
	status: string
	sport: { id: string; name: string }
}
type TeamRow = { id: string; name: string; abbreviation: string; color: string }
type PlayerRow = {
	id: string
	name: string
	position: string | null
	currentTeam: { id: string; name: string; abbreviation: string } | null
}
type GameRow = {
	id: string
	startsAt: string
	status: string
	homeScore: number | null
	awayScore: number | null
	homeTeam: { id: string }
	awayTeam: { id: string }
}
type TeamOption = { id: string; name: string; abbreviation: string }

// The shared chrome every entity form below wraps itself in - title, close
// button, error line, save/cancel footer. Each form owns its own useForm
// instance and mutation (different schema/mutation per entity type, so they
// can't share one hook call), but they all look and behave the same way.
function EntityModalShell({
	title,
	formId,
	saving,
	canSave,
	formError,
	children,
}: {
	title: string
	formId: string
	saving: boolean
	canSave: boolean
	formError: string | null
	children: ReactNode
}) {
	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>{title}</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				{children}
				<FormError message={formError} />
			</VStack>
			<HStack justify="flex-end" gap="3">
				<Button variant="ghost" onClick={closeModal}>
					Cancel
				</Button>
				<Button
					type="submit"
					form={formId}
					variant="solid"
					loading={saving}
					disabled={saving || !canSave}
				>
					Save
				</Button>
			</HStack>
		</Modal>
	)
}

function statusOptionLabel(status: string) {
	return status === "active" ? "Active" : "Inactive"
}

export function AddEditLeagueModal({
	sports,
	league,
	onSaved,
}: {
	sports: { id: string; name: string }[]
	league?: LeagueRow
	onSaved: () => void
}) {
	const isEdit = !!league
	const [createLeague] = useMutation(CreateLeagueDocument)
	const [updateLeague] = useMutation(UpdateLeagueDocument)

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
						await updateLeague({
							variables: { input: { id: league.id, ...wireValues } },
						})
					).data?.updateLeague
				: (await createLeague({ variables: { input: wireValues } })).data
						?.createLeague
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
				.with({ __typename: "AuthorizationError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "NotFoundError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "League" }, async () => {
					closeModal()
					onSaved()
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

export function AddEditTeamModal({
	leagueId,
	team,
	onSaved,
}: {
	leagueId: string
	team?: TeamRow
	onSaved: () => void
}) {
	const isEdit = !!team
	const [createTeam] = useMutation(CreateTeamDocument)
	const [updateTeam] = useMutation(UpdateTeamDocument)

	const form = useForm({
		schema: createTeamSchema,
		defaultValues: {
			leagueId,
			name: team?.name ?? "",
			abbreviation: team?.abbreviation ?? "",
			color: team?.color ?? "",
		},
		onSubmit: async (values, helpers) => {
			const result = isEdit
				? (
						await updateTeam({
							variables: { input: { id: team.id, ...values } },
						})
					).data?.updateTeam
				: (await createTeam({ variables: { input: values } })).data?.createTeam
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
				.with({ __typename: "AuthorizationError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "NotFoundError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "Team" }, async () => {
					closeModal()
					onSaved()
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
					</EntityModalShell>
				)}
			</form.Subscribe>
		</form>
	)
}

export function AddEditPlayerModal({
	teams,
	player,
	onSaved,
}: {
	teams: TeamOption[]
	player?: PlayerRow
	onSaved: () => void
}) {
	const isEdit = !!player
	const [createPlayer] = useMutation(CreatePlayerDocument)
	const [updatePlayer] = useMutation(UpdatePlayerDocument)

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
						await updatePlayer({
							variables: { input: { id: player.id, ...values } },
						})
					).data?.updatePlayer
				: (await createPlayer({ variables: { input: values } })).data
						?.createPlayer
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
				.with({ __typename: "AuthorizationError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "NotFoundError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "Player" }, async () => {
					closeModal()
					onSaved()
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

const gameStatusOptions = [
	{ value: "scheduled", label: "Scheduled" },
	{ value: "live", label: "Live" },
	{ value: "final", label: "Final" },
] as const

// Matches DateTimePicker's own VALUE_FORMAT so an existing game's ISO
// startsAt round-trips into the picker's edit-in-place value shape.
function toDateTimeLocal(iso: string) {
	return DateTime.fromISO(iso).toFormat("yyyy-MM-dd'T'HH:mm")
}

export function AddEditGameModal({
	leagueId,
	teams,
	game,
	onSaved,
}: {
	leagueId: string
	teams: TeamOption[]
	game?: GameRow
	onSaved: () => void
}) {
	const isEdit = !!game
	const [createGame] = useMutation(CreateGameDocument)
	const [updateGame] = useMutation(UpdateGameDocument)

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
						await updateGame({
							variables: { input: { id: game.id, ...wireValues } },
						})
					).data?.updateGame
				: (await createGame({ variables: { input: wireValues } })).data
						?.createGame
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
				.with({ __typename: "AuthorizationError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "NotFoundError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "Game" }, async () => {
					closeModal()
					onSaved()
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
