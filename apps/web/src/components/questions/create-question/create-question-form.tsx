import { useMutation, useQuery } from "@apollo/client/react"
import {
	createQuestionSchema,
	generateQuestionTitle,
} from "@called-my-shot/schemas"
import { useNavigate, useRouter } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FieldHint } from "#/components/ui/field-hint"
import { FormError } from "#/components/ui/form-error"
import { TextInput } from "#/components/ui/text-input"
import type { QuestionShape, SportsQuery } from "#/graphql/generated/graphql"
import { CreateQuestionDocument } from "#/graphql/mutations/questions"
import {
	GameByIdDocument,
	PlayersByLeagueDocument,
	StatsBySportDocument,
	TeamsByLeagueDocument,
} from "#/graphql/queries/sports"
import { useForm } from "#/lib/form/use-form"
import type { EntitySearchItem } from "./entity-search-field"
import { GameField } from "./game-field"
import { LeagueField } from "./league-field"
import { OfficialToggle } from "./official-toggle"
import { OptionList } from "./option-list"
import { PoolSummary } from "./pool-summary"
import { QuestionTypePicker } from "./question-type-picker"
import { ResolutionFields } from "./resolution-fields"
import { StatPicker } from "./stat-picker"
import { SubjectPicker } from "./subject-picker"

// player_season_award/team_season_award/player_award_finalists can only ever
// be posted as official - see questionShapeSchema's ADMIN_ONLY_SHAPES in
// packages/schemas/src/questions.ts. Kept as its own small list here (rather
// than imported) since QuestionTypePicker already filters these out of the
// picker for non-admins - by the time one of these three is selected, the
// viewer is guaranteed to be an admin.
const ADMIN_ONLY_SHAPES = [
	"player_season_award",
	"team_season_award",
	"player_award_finalists",
] as const

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
			shape: "player_stat_over_under",
			sportId: "",
			leagueId: "",
			gameId: undefined,
			resolutionSource: "",
			resolutionSourceUrl: "",
			locksAt: "",
			isOfficial: false,
			options: [],
			statId: undefined,
			customStat: "",
			ouLine: undefined,
			subjectTeamId: undefined,
			subjectPlayerId: undefined,
			picksRequired: 1,
			eventClause: "",
			awardName: "",
		},
		onSubmit: async (values, helpers) => {
			const { data } = await createQuestion({
				variables: {
					input: {
						shape: values.shape.toUpperCase() as QuestionShape,
						sportId: values.sportId,
						leagueId: values.leagueId,
						gameId: values.gameId,
						resolutionSource: values.resolutionSource,
						resolutionSourceUrl: values.resolutionSourceUrl || undefined,
						locksAt: values.locksAt,
						isOfficial: values.isOfficial,
						options: values.options.map((option) => ({
							label: option.label,
							teamId: option.teamId,
							playerId: option.playerId,
						})),
						statId: values.statId,
						customStat: values.customStat || undefined,
						ouLine: values.ouLine,
						subjectTeamId: values.subjectTeamId,
						subjectPlayerId: values.subjectPlayerId,
						picksRequired: values.picksRequired,
						eventClause: values.eventClause || undefined,
						awardName: values.awardName || undefined,
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

	const shape = form.useWatch("shape")
	const sportId = form.useWatch("sportId")
	const leagueId = form.useWatch("leagueId")
	const gameId = form.useWatch("gameId")
	const options = form.useWatch("options")
	const subjectTeamId = form.useWatch("subjectTeamId")
	const subjectPlayerId = form.useWatch("subjectPlayerId")
	const statId = form.useWatch("statId")
	const customStat = form.useWatch("customStat")
	const ouLine = form.useWatch("ouLine")
	const awardName = form.useWatch("awardName")
	const eventClause = form.useWatch("eventClause")
	const picksRequired = form.useWatch("picksRequired")

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
	// Fetched here (not just inside GameField) because a picked game also
	// narrows every team/player picker below to its own two sides - you can't
	// pick the Cleveland Cavaliers as the subject of a Denver @ Boston game.
	const { data: selectedGameData } = useQuery(GameByIdDocument, {
		variables: { id: gameId ?? "" },
		skip: !gameId,
	})
	const selectedGame = selectedGameData?.game ?? null

	const teams = teamsData?.teams ?? []
	const players = playersData?.players ?? []
	const stats = statsData?.stats ?? []

	// Stable across renders (unlike a plain `new Set(...)` literal) so the
	// stale-selection effect below only actually re-runs when the picked
	// game's two teams change, not on every render.
	const gameTeamIds = useMemo(
		() =>
			selectedGame
				? new Set([selectedGame.homeTeam.id, selectedGame.awayTeam.id])
				: null,
		[selectedGame],
	)
	const scopedTeams = gameTeamIds
		? teams.filter((team) => gameTeamIds.has(team.id))
		: teams
	const scopedPlayers = gameTeamIds
		? players.filter(
				(player) =>
					player.currentTeam && gameTeamIds.has(player.currentTeam.id),
			)
		: players

	// Narrowing the pickers above is cosmetic on its own - a subject or option
	// picked before the game was (or before it changed) can still be sitting
	// in form state pointing at a team/player outside the new game's two
	// sides. Only fires once there's an actual game to scope to; deselecting
	// a game doesn't retroactively invalidate picks made under the full
	// league-wide list.
	useEffect(() => {
		if (!gameTeamIds) return
		if (subjectTeamId && !gameTeamIds.has(subjectTeamId)) {
			form.setValue("subjectTeamId", undefined)
		}
		if (subjectPlayerId) {
			const player = players.find((p) => p.id === subjectPlayerId)
			if (!player?.currentTeam || !gameTeamIds.has(player.currentTeam.id)) {
				form.setValue("subjectPlayerId", undefined)
			}
		}
		form.setValue("options", (prev) =>
			prev.filter((option) => {
				if (option.teamId) return gameTeamIds.has(option.teamId)
				if (option.playerId) {
					const player = players.find((p) => p.id === option.playerId)
					return !!player?.currentTeam && gameTeamIds.has(player.currentTeam.id)
				}
				return true
			}),
		)
	}, [gameTeamIds, subjectTeamId, subjectPlayerId, players, form])

	const isPlayerStatOU = shape === "player_stat_over_under"
	const isTeamStatOU = shape === "team_stat_over_under"
	const isGameTotalOU = shape === "game_total_over_under"
	const isAnyOU = isPlayerStatOU || isTeamStatOU || isGameTotalOU
	const isPlayerNumeric = shape === "player_stat_numeric_guess"
	const isTeamNumeric = shape === "team_stat_numeric_guess"
	const isPlayerVsPlayer = shape === "player_vs_player"
	const isTeamVsTeam = shape === "team_vs_team"
	const isYesNo = shape === "yes_no_prop"
	const isPlayerAward = shape === "player_season_award"
	const isTeamAward = shape === "team_season_award"
	const isAnyAward = isPlayerAward || isTeamAward
	const isFinalists = shape === "player_award_finalists"
	const isAdminOnlyShape = (ADMIN_ONLY_SHAPES as readonly string[]).includes(
		shape,
	)

	// player_season_award/team_season_award's pool is always the full league
	// roster (see pool-summary.tsx) - player_award_finalists' is a small,
	// admin-curated shortlist of real announced finalists instead (see
	// option-list.tsx). Neither is scoped to a picked game since none of
	// these three shapes are game-scoped in the first place.
	const awardPoolItems: EntitySearchItem[] | null = isPlayerAward
		? players.map((player) => ({
				id: player.id,
				label: player.name,
				kind: "player" as const,
				meta: player.currentTeam?.abbreviation,
			}))
		: isTeamAward
			? teams.map((team) => ({
					id: team.id,
					label: team.name,
					kind: "team" as const,
					meta: team.abbreviation,
				}))
			: null
	const finalistItems: EntitySearchItem[] | null = isFinalists
		? players.map((player) => ({
				id: player.id,
				label: player.name,
				kind: "player" as const,
				meta: player.currentTeam?.abbreviation,
			}))
		: null

	function selectType(next: typeof shape) {
		form.setValue("shape", next)
		setHasSelectedType(true)
		// Shape-specific fields from whatever was previously selected shouldn't
		// leak into the newly chosen shape's submission. player_vs_player gets
		// its 2 fixed slots pre-seeded here rather than grown/shrunk by
		// OptionList itself (see its exactCount prop) - there's never a valid
		// state with anything other than exactly 2 for this shape.
		form.setValue(
			"options",
			next === "player_vs_player" ? [{ label: "" }, { label: "" }] : [],
		)
		form.setValue("statId", undefined)
		form.setValue("customStat", "")
		form.setValue("ouLine", undefined)
		form.setValue("subjectTeamId", undefined)
		form.setValue("subjectPlayerId", undefined)
		form.setValue("picksRequired", 1)
		form.setValue("eventClause", "")
		form.setValue("awardName", "")
		if ((ADMIN_ONLY_SHAPES as readonly string[]).includes(next)) {
			form.setValue("isOfficial", true)
		}
	}

	// Mirrors generateQuestionTitle's own server-side call (see createQuestion
	// in apps/api's resolver) against whatever's filled in so far - null once
	// any piece it needs is still missing, rather than a half-built string.
	const selectedStatName = statId
		? stats.find((stat) => stat.id === statId)?.name
		: undefined
	const statName = selectedStatName ?? customStat
	const selectedPlayerName = subjectPlayerId
		? players.find((player) => player.id === subjectPlayerId)?.name
		: undefined
	const selectedTeamName = subjectTeamId
		? teams.find((team) => team.id === subjectTeamId)?.name
		: undefined
	const subjectName = selectedPlayerName ?? selectedTeamName ?? null

	const titlePreview: string | null = match(shape)
		.with("player_stat_over_under", (s) =>
			selectedPlayerName && statName && ouLine !== undefined
				? generateQuestionTitle({
						shape: s,
						playerName: selectedPlayerName,
						statName,
						ouLine,
					})
				: null,
		)
		.with("team_stat_over_under", (s) =>
			selectedTeamName && statName && ouLine !== undefined
				? generateQuestionTitle({
						shape: s,
						teamName: selectedTeamName,
						statName,
						ouLine,
					})
				: null,
		)
		.with("game_total_over_under", (s) =>
			selectedGame && statName && ouLine !== undefined
				? generateQuestionTitle({
						shape: s,
						awayTeamName: selectedGame.awayTeam.name,
						homeTeamName: selectedGame.homeTeam.name,
						statName,
						ouLine,
					})
				: null,
		)
		.with("player_stat_numeric_guess", (s) =>
			selectedPlayerName && statName
				? generateQuestionTitle({
						shape: s,
						playerName: selectedPlayerName,
						statName,
					})
				: null,
		)
		.with("team_stat_numeric_guess", (s) =>
			selectedTeamName && statName
				? generateQuestionTitle({
						shape: s,
						teamName: selectedTeamName,
						statName,
					})
				: null,
		)
		.with("player_vs_player", (s) => {
			const [a, b] = options
			return a?.label && b?.label && statName
				? generateQuestionTitle({
						shape: s,
						playerAName: a.label,
						playerBName: b.label,
						statName,
					})
				: null
		})
		.with("team_vs_team", (s) =>
			selectedGame
				? generateQuestionTitle({
						shape: s,
						awayTeamName: selectedGame.awayTeam.name,
						homeTeamName: selectedGame.homeTeam.name,
					})
				: null,
		)
		.with("yes_no_prop", (s) =>
			eventClause.trim()
				? generateQuestionTitle({ shape: s, subjectName, eventClause })
				: null,
		)
		.with("player_season_award", "team_season_award", (s) =>
			awardName.trim() && picksRequired
				? generateQuestionTitle({ shape: s, awardName, picksRequired })
				: null,
		)
		.with("player_award_finalists", (s) =>
			awardName.trim() && options.length >= 2
				? generateQuestionTitle({
						shape: s,
						awardName,
						finalistNames: options.map((option) => option.label),
					})
				: null,
		)
		.exhaustive()

	return (
		<form onSubmit={form.handleSubmit}>
			<VStack gap="6" alignItems="stretch">
				<Section label="What kind of call is this?" required>
					<QuestionTypePicker
						value={hasSelectedType ? shape : null}
						onChange={selectType}
						isAdmin={isAdmin}
					/>
				</Section>

				{hasSelectedType && (
					<>
						{(isAnyOU || isPlayerNumeric || isTeamNumeric) && (
							<Section label={isAnyOU ? "The line" : "The stat"} required>
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<GameField
												form={form}
												leagueId={leagueId}
												selectedGame={selectedGame}
												required={isGameTotalOU || isPlayerNumeric || isTeamNumeric}
											/>
											{leagueId ? (
												<>
													<StatPicker
														form={form}
														stats={stats.filter(
															(s) =>
																s.appliesTo === "BOTH" ||
																s.appliesTo ===
																	(isPlayerStatOU || isPlayerNumeric
																		? "PLAYER"
																		: "TEAM"),
														)}
														catalogOnly={isPlayerNumeric || isTeamNumeric}
													/>
													{isAnyOU && (
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
													)}
													{(isPlayerStatOU ||
														isTeamStatOU ||
														isPlayerNumeric ||
														isTeamNumeric) && (
														<SubjectPicker
															form={form}
															teams={scopedTeams}
															players={scopedPlayers}
															kind={
																isPlayerStatOU || isPlayerNumeric
																	? "player"
																	: "team"
															}
															required
														/>
													)}
												</>
											) : (
												<FieldHint>
													Pick a league above to choose the stat{" "}
													{isAnyOU ? "and subject" : "and subject"} - both pull
													from that league's catalog.
												</FieldHint>
											)}
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						{isPlayerVsPlayer && (
							<Section label="The comparison" required>
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<GameField
												form={form}
												leagueId={leagueId}
												selectedGame={selectedGame}
											/>
											<StatPicker
												form={form}
												stats={stats.filter(
													(s) => s.appliesTo === "BOTH" || s.appliesTo === "PLAYER",
												)}
											/>
											<OptionList
												form={form}
												items={scopedPlayers.map((player) => ({
													id: player.id,
													label: player.name,
													kind: "player" as const,
													meta: player.currentTeam?.abbreviation,
												}))}
												rowPlaceholder="Player name"
												addLabel="+ Add player"
												exactCount={2}
											/>
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						{isTeamVsTeam && (
							<Section label="The matchup" required>
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<GameField
												form={form}
												leagueId={leagueId}
												selectedGame={selectedGame}
												required
											/>
											<p
												className={css({ fontSize: "xs", color: "fg.subtle" })}
											>
												The two options are the game's own home and away teams -
												nothing to configure once a game's picked.
											</p>
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						{isYesNo && (
							<Section label="The proposition" required>
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<GameField
												form={form}
												leagueId={leagueId}
												selectedGame={selectedGame}
											/>
											<form.Field name="eventClause">
												{(field) => (
													<TextInput
														error={field.meta.error ?? undefined}
														description={
															'What follows "Will {subject}…" - e.g. "signs a contract extension by March 1."'
														}
													>
														<TextInput.Label required>
															What's being predicted
														</TextInput.Label>
														<TextInput.Group>
															<TextInput.Field
																placeholder="records a triple-double tonight"
																aria-required
																value={field.value}
																onChange={field.onChange}
																onBlur={field.onBlur}
															/>
														</TextInput.Group>
													</TextInput>
												)}
											</form.Field>
											<SubjectPicker
												form={form}
												teams={scopedTeams}
												players={scopedPlayers}
												kind="either"
											/>
											<p
												className={css({ fontSize: "xs", color: "fg.subtle" })}
											>
												Fixed at exactly two options — nothing else to
												configure.
											</p>
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						{isAnyAward && (
							<Section label="The award" required>
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<form.Field name="awardName">
												{(field) => (
													<TextInput
														error={field.meta.error ?? undefined}
														description={`The award's real name, e.g. "MVP" or "Rookie of the Year."`}
													>
														<TextInput.Label required>
															Award name
														</TextInput.Label>
														<TextInput.Group>
															<TextInput.Field
																placeholder="MVP"
																aria-required
																value={field.value}
																onChange={field.onChange}
																onBlur={field.onBlur}
															/>
														</TextInput.Group>
													</TextInput>
												)}
											</form.Field>
											<div className={css({ width: "64" })}>
												<form.Field name="picksRequired">
													{(field) => (
														<TextInput
															error={field.meta.error ?? undefined}
															description="1 for a single-winner award (MVP). Higher for a fixed-size group award (an All-NBA team)."
														>
															<TextInput.Label required>
																Winners
															</TextInput.Label>
															<TextInput.Group>
																<TextInput.Field
																	type="number"
																	aria-required
																	min={1}
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
											{awardPoolItems === null ? (
												<FieldHint>Pick a league to see the pool.</FieldHint>
											) : (
												<PoolSummary form={form} items={awardPoolItems} />
											)}
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						{isFinalists && (
							<Section label="The award" required>
								<Card>
									<Card.Body>
										<VStack gap="3.5" alignItems="stretch">
											<LeagueField form={form} sports={sports} />
											<form.Field name="awardName">
												{(field) => (
													<TextInput
														error={field.meta.error ?? undefined}
														description={`The award's real name, e.g. "Defensive Player of the Year."`}
													>
														<TextInput.Label required>
															Award name
														</TextInput.Label>
														<TextInput.Group>
															<TextInput.Field
																placeholder="Defensive Player of the Year"
																aria-required
																value={field.value}
																onChange={field.onChange}
																onBlur={field.onBlur}
															/>
														</TextInput.Group>
													</TextInput>
												)}
											</form.Field>
											<OptionList
												form={form}
												items={finalistItems}
												rowPlaceholder="Finalist name"
												addLabel="+ Add finalist"
											/>
										</VStack>
									</Card.Body>
								</Card>
							</Section>
						)}

						<Section label="Title">
							<Card>
								<Card.Body>
									<VStack gap="1.5" alignItems="stretch">
										<span
											className={css({
												fontFamily: "mono",
												fontSize: "2xs",
												letterSpacing: "wide",
												color: "fg.subtle",
												textTransform: "uppercase",
											})}
										>
											Generated automatically
										</span>
										<span
											className={css({
												fontSize: "md",
												fontWeight: "semibold",
												color: titlePreview ? "fg.default" : "fg.subtle",
											})}
										>
											{titlePreview ??
												"Fill in the fields above to preview your title."}
										</span>
									</VStack>
								</Card.Body>
							</Card>
						</Section>

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
													disabled={isAdminOnlyShape}
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
