import { useMutation, useQuery } from "@apollo/client/react"
import {
	createQuestionSchema,
	questionCategorySchema,
} from "@called-my-shot/schemas"
import { useNavigate, useRouter } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { Select } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import { Textarea } from "#/components/ui/textarea"
import type {
	NumericSubjectType,
	QuestionCategory,
	QuestionType,
	SportsQuery,
} from "#/graphql/generated/graphql"
import { CreateQuestionDocument } from "#/graphql/mutations/questions"
import {
	PlayersByLeagueDocument,
	StatsBySportDocument,
	TeamsByLeagueDocument,
} from "#/graphql/queries/sports"
import { useForm } from "#/lib/form/use-form"
import { questionCategoryLabel } from "#/lib/question-labels"
import { ChipButton } from "./chip-button"
import type { EntitySearchItem } from "./entity-search-field"
import { LeagueField } from "./league-field"
import { OfficialToggle } from "./official-toggle"
import { OpenFieldNudge } from "./open-field-nudge"
import { OpenFieldToggle } from "./open-field-toggle"
import { OptionList } from "./option-list"
import { PoolSummary } from "./pool-summary"
import { QuestionTypePicker } from "./question-type-picker"
import { ResolutionFields } from "./resolution-fields"
import { StatPicker } from "./stat-picker"
import { SubjectPicker } from "./subject-picker"

function categoryLabel(value: string) {
	if (!value) return "Select a category…"
	return questionCategoryLabel[value.toUpperCase() as QuestionCategory]
}

function Section({
	label,
	required,
	children,
}: {
	label: string
	required?: boolean
	children: ReactNode
}) {
	return (
		<VStack gap="3" alignItems="stretch">
			<HStack
				justify="space-between"
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					textTransform: "uppercase",
				})}
			>
				<span>{label}</span>
				{required && (
					<span className={css({ color: "fg.subtle" })}>required</span>
				)}
			</HStack>
			{children}
		</VStack>
	)
}

type Props = {
	sports: SportsQuery["sports"]
	isAdmin: boolean
}

export function CreateQuestionForm({ sports, isAdmin }: Props) {
	const [hasSelectedType, setHasSelectedType] = useState(false)
	const [createQuestion] = useMutation(CreateQuestionDocument)
	const router = useRouter()
	const navigate = useNavigate()

	const form = useForm({
		schema: createQuestionSchema,
		defaultValues: {
			type: "multiple_choice",
			category: "",
			title: "",
			sportId: "",
			leagueId: "",
			resolutionSource: "",
			resolutionSourceUrl: "",
			locksAt: "",
			isOfficial: false,
			options: [],
			optionsOpenField: false,
			openFieldKind: undefined,
			statId: undefined,
			customStat: "",
			ouLine: undefined,
			// Matches SubjectPicker's default chip state - it always shows PLAYER
			// pre-selected, so the underlying value should actually start there
			// too instead of leaving the chips visually ahead of the form state.
			numericSubjectType: "player",
			subjectTeamId: undefined,
			subjectPlayerId: undefined,
			picksRequired: 5,
		},
		onSubmit: async (values, helpers) => {
			const { data } = await createQuestion({
				variables: {
					input: {
						type: values.type.toUpperCase() as QuestionType,
						category: values.category.toUpperCase() as QuestionCategory,
						title: values.title,
						sportId: values.sportId,
						leagueId: values.leagueId,
						resolutionSource: values.resolutionSource,
						resolutionSourceUrl: values.resolutionSourceUrl || undefined,
						locksAt: values.locksAt,
						isOfficial: values.isOfficial,
						options: values.options.map((option) => ({
							label: option.label,
							teamId: option.teamId,
							playerId: option.playerId,
						})),
						optionsOpenField:
							values.type === "multiple_choice"
								? values.optionsOpenField
								: undefined,
						openFieldKind:
							values.type === "multiple_choice" && values.optionsOpenField
								? (values.openFieldKind?.toUpperCase() as NumericSubjectType)
								: undefined,
						statId: values.statId,
						customStat: values.customStat || undefined,
						ouLine: values.ouLine,
						// numericSubjectType defaults to "player" in the picker's chip
						// state even when over_under's subject is left blank (it's
						// optional there) - only worth sending once an actual team/
						// player has been picked, not just because a chip is pre-lit.
						numericSubjectType:
							values.subjectTeamId || values.subjectPlayerId
								? (values.numericSubjectType?.toUpperCase() as NumericSubjectType)
								: undefined,
						subjectTeamId: values.subjectTeamId,
						subjectPlayerId: values.subjectPlayerId,
						picksRequired: values.picksRequired,
					},
				},
			})
			const result = data?.createQuestion

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
					helpers.setFormError("You need to sign in to create a question.")
				})
				.with({ __typename: "AuthorizationError" }, async () => {
					helpers.setFormError("Only admins can post official questions.")
				})
				.with({ __typename: "QuestionPayload" }, async (r) => {
					await router.invalidate()
					await navigate({
						to: "/questions/$questionId",
						params: { questionId: r.question.id },
					})
				})
				.exhaustive()
		},
	})

	const type = form.useWatch("type")
	const category = form.useWatch("category")
	const sportId = form.useWatch("sportId")
	const leagueId = form.useWatch("leagueId")
	const optionsOpenField = form.useWatch("optionsOpenField")
	const openFieldKind = form.useWatch("openFieldKind")
	const options = form.useWatch("options")

	const { data: teamsData } = useQuery(TeamsByLeagueDocument, {
		variables: { leagueId },
		skip: !leagueId,
	})
	const { data: playersData } = useQuery(PlayersByLeagueDocument, {
		variables: { leagueId },
		skip: !leagueId,
	})
	const { data: statsData } = useQuery(StatsBySportDocument, {
		variables: { sportId },
		skip: !sportId,
	})

	const teams = teamsData?.teams ?? []
	const players = playersData?.players ?? []
	const stats = statsData?.stats ?? []

	const optionItems: EntitySearchItem[] | null =
		category === "season_awards" || category === "game_stats"
			? teams.map((team) => ({
					id: team.id,
					label: team.name,
					kind: "team" as const,
					meta: team.abbreviation,
				}))
			: category === "player_stats"
				? players.map((player) => ({
						id: player.id,
						label: player.name,
						kind: "player" as const,
						meta: player.currentTeam?.abbreviation,
					}))
				: null

	function selectType(next: typeof type) {
		form.setValue("type", next)
		setHasSelectedType(true)
		// Type-specific fields from whatever was previously selected shouldn't
		// leak into the newly chosen type's submission.
		form.setValue("options", [])
		form.setValue("optionsOpenField", false)
		form.setValue("openFieldKind", undefined)
		form.setValue("statId", undefined)
		form.setValue("customStat", "")
		form.setValue("ouLine", undefined)
		form.setValue("numericSubjectType", "player")
		form.setValue("subjectTeamId", undefined)
		form.setValue("subjectPlayerId", undefined)
		form.setValue("picksRequired", 5)
	}

	return (
		<form onSubmit={form.handleSubmit}>
			<VStack gap="6" alignItems="stretch">
				<Section label="What kind of call is this?" required>
					<QuestionTypePicker
						value={hasSelectedType ? type : null}
						onChange={selectType}
					/>
				</Section>

				{hasSelectedType && (
					<>
						<Section label="The question" required>
							<Card>
								<Card.Body>
									<VStack gap="3.5" alignItems="stretch">
										<form.Field name="title">
											{(field) => (
												<Textarea error={field.meta.error ?? undefined}>
													<Textarea.Label required>
														Question text
													</Textarea.Label>
													<Textarea.Field
														placeholder="e.g. Who wins the 2027 championship?"
														maxLength={140}
														aria-required
														value={field.value}
														onChange={field.onChange}
														onBlur={field.onBlur}
													/>
												</Textarea>
											)}
										</form.Field>
										<VStack gap="1.5" alignItems="stretch">
											<FieldLabel required>Category</FieldLabel>
											<form.Field name="category">
												{(field) => (
													<Select
														value={field.value}
														onValueChange={field.onChange}
														error={field.meta.error ?? undefined}
														description="Determines which real teams or players the options below can pull from."
													>
														<Select.Trigger>
															{categoryLabel(field.value)}
														</Select.Trigger>
														<Select.Content>
															{questionCategorySchema.options.map((c) => (
																<Select.Option key={c} value={c}>
																	{categoryLabel(c)}
																</Select.Option>
															))}
														</Select.Content>
													</Select>
												)}
											</form.Field>
										</VStack>
									</VStack>
								</Card.Body>
							</Card>
						</Section>

						{type === "multiple_choice" && (
							<Section label="Options" required>
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<form.Field name="optionsOpenField">
												{(field) => (
													<OpenFieldToggle
														checked={!!field.value}
														onChange={(checked) => {
															field.onChange(checked)
															form.setValue("options", [])
															form.setValue("openFieldKind", undefined)
														}}
													/>
												)}
											</form.Field>
											{optionsOpenField ? (
												<VStack gap="2" alignItems="stretch">
													<FieldLabel required>What fills the field</FieldLabel>
													<HStack gap="1.5">
														{(["player", "team"] as const).map((kind) => (
															<ChipButton
																key={kind}
																selected={openFieldKind === kind}
																onClick={() =>
																	form.setValue("openFieldKind", kind)
																}
															>
																{kind.toUpperCase()}
															</ChipButton>
														))}
													</HStack>
												</VStack>
											) : (
												<>
													{(category === "season_awards" ||
														category === "player_stats") &&
														options.length > 0 && (
															<OpenFieldNudge
																onSwitchToOpenField={() => {
																	form.setValue("optionsOpenField", true)
																	form.setValue("options", [])
																	form.setValue("openFieldKind", undefined)
																}}
															/>
														)}
													<OptionList
														form={form}
														items={optionItems}
														rowPlaceholder="Option name"
														addLabel="+ Add option"
													/>
												</>
											)}
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						{type === "yes_no" && (
							<Section label="Options">
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<p
												className={css({ fontSize: "xs", color: "fg.subtle" })}
											>
												Fixed at exactly two options — nothing to type, nothing
												to configure.
											</p>
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						{type === "over_under" && (
							<Section label="The line" required>
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<StatPicker form={form} stats={stats} />
											<div className={css({ width: "64" })}>
												<form.Field name="ouLine">
													{(field) => (
														<TextInput
															error={field.meta.error ?? undefined}
															description="Can't be a whole number - the result has to be able to land on one side or the other, never exactly on it."
														>
															<TextInput.Label required>
																Line value
															</TextInput.Label>
															<TextInput.Group>
																<TextInput.Field
																	type="number"
																	step="0.5"
																	placeholder="224.5"
																	aria-required
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
											</div>
											<SubjectPicker
												form={form}
												teams={teams}
												players={players}
											/>
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						{type === "numeric_guess" && (
							<Section label="The stat" required>
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<StatPicker form={form} stats={stats} catalogOnly />
											<SubjectPicker
												form={form}
												teams={teams}
												players={players}
												required
											/>
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						{type === "multi_select" && (
							<Section label="Pool & picks" required>
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<div className={css({ width: "64" })}>
												<form.Field name="picksRequired">
													{(field) => (
														<TextInput
															error={field.meta.error ?? undefined}
															description="Only works if the real result is guaranteed to be exactly this many - not for anything where the actual count could vary."
														>
															<TextInput.Label required>
																Picks required
															</TextInput.Label>
															<TextInput.Group>
																<TextInput.Field
																	type="number"
																	aria-required
																	min={2}
																	max={15}
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
											</div>
											{optionItems === null ? (
												<OptionList
													form={form}
													items={optionItems}
													rowPlaceholder="Candidate name"
													addLabel="+ Add candidate"
												/>
											) : (
												<PoolSummary form={form} items={optionItems} />
											)}
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						<Section label="Resolution" required>
							<Card>
								<Card.Body>
									<ResolutionFields form={form} />
								</Card.Body>
							</Card>
						</Section>

						{isAdmin && (
							<Section label="Visibility">
								<Card>
									<Card.Body>
										<form.Field name="isOfficial">
											{(field) => (
												<OfficialToggle
													checked={!!field.value}
													onChange={(checked) => field.onChange(checked)}
												/>
											)}
										</form.Field>
									</Card.Body>
								</Card>
							</Section>
						)}

						<form.Subscribe selector={(s) => s.meta}>
							{(meta) => (
								<VStack gap="2" alignItems="stretch">
									<Button
										type="submit"
										variant="solid"
										size="lg"
										fullWidth
										loading={meta.isSubmitting}
										disabled={meta.isSubmitting || !meta.canSubmit}
									>
										Publish Question
									</Button>
									<FormError message={meta.formError} />
								</VStack>
							)}
						</form.Subscribe>
					</>
				)}
			</VStack>
		</form>
	)
}
