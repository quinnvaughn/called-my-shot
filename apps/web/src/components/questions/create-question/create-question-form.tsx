import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { MultiSelect } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import type { SportsQuery } from "#/graphql/generated/graphql"
import { BallotField } from "./ballot-field"
import { ChipField, FormProvider } from "./form-context"
import { GameField } from "./game-field"
import { LeagueField } from "./league-field"
import { OfficialToggle } from "./official-toggle"
import { OptionList } from "./option-list"
import { PoolSummary } from "./pool-summary"
import { QuestionTypePicker } from "./question-type-picker"
import { ResolutionFields } from "./resolution-fields"
import { Section } from "./section"
import { StatPicker } from "./stat-picker"
import { SubjectPicker } from "./subject-picker"
import { useCreateQuestionForm } from "./use-create-question-form"

// A MultiSelect.Trigger's label - lists the picks by name up to a point,
// then falls back to a count once that'd make the trigger unreadably wide
// (an NFL position list, a many-division race).
function multiSelectSummary(values: string[], emptyLabel: string): string {
	if (values.length === 0) return emptyLabel
	if (values.length <= 3) return values.join(", ")
	return `${values.length} selected`
}

// "Rookie (0)" / "1 year" / "2 years" - shared between the option labels in
// the years-in-league MultiSelect below and the pool summary's scopeLabel, so
// the two can't drift.
function yearsInLeagueLabel(years: number): string {
	return years === 0
		? "Rookie (0)"
		: `${years} ${years === 1 ? "year" : "years"}`
}

type Props = {
	sports: SportsQuery["sports"]
	isAdmin: boolean
	// Set when arriving from the admin Ballots builder's "+ New Question"
	// button - see new-question.tsx's validateSearch.
	lockedBallotId?: string
}

export function CreateQuestionForm({ sports, isAdmin, lockedBallotId }: Props) {
	const {
		form,
		shape,
		leagueId,
		awardName,
		awardConferences,
		awardDivisions,
		awardPositions,
		awardSeasonsInLeague,
		awardRookieOnly,
		ballotId,
		hasSelectedType,
		selectType,
		setTitleEdited,
		titlePreview,
		teams,
		players,
		stats,
		selectedGame,
		scopedTeams,
		scopedPlayers,
		conferenceOptions,
		divisionOptions,
		positionOptions,
		yearsInLeagueOptions,
		awardPoolItems,
		gameStatLeaderPoolItems,
		finalistItems,
		seasonStatLeaderItems,
		offersStatAggregation,
		isPlayerStatOU,
		isTeamStatOU,
		isPlayerSeasonOU,
		isTeamSeasonOU,
		isAnyOU,
		isPlayerNumeric,
		isTeamNumeric,
		isTeamSeasonNumeric,
		isPlayerVsPlayer,
		isPlayerVsPlayerSeason,
		isTeamVsTeam,
		isTeamVsTeamSeason,
		isGameStatLeader,
		isSeasonStatLeader,
		isYesNo,
		isPlayerAward,
		isAnyAward,
		isFinalists,
		isAdminOnlyShape,
	} = useCreateQuestionForm()

	return (
		<FormProvider form={form}>
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
							{(isAnyOU ||
								isPlayerNumeric ||
								isTeamNumeric ||
								isTeamSeasonNumeric) && (
								<Section label={isAnyOU ? "The number" : "The stat"} required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												{!isPlayerSeasonOU &&
													!isTeamSeasonOU &&
													!isTeamSeasonNumeric && (
														<GameField
															leagueId={leagueId}
															selectedGame={selectedGame}
															required
														/>
													)}
												{leagueId ? (
													<>
														<StatPicker
															stats={stats.filter(
																(s) =>
																	s.appliesTo === "BOTH" ||
																	s.appliesTo ===
																		(isPlayerStatOU ||
																		isPlayerSeasonOU ||
																		isPlayerNumeric
																			? "PLAYER"
																			: "TEAM"),
															)}
															catalogOnly={
																isPlayerNumeric ||
																isTeamNumeric ||
																isTeamSeasonNumeric
															}
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
																				Number
																			</TextInput.Label>
																			<TextInput.Group>
																				<TextInput.Field
																					type="number"
																					// "any", not a fixed 0.5 - a rate-stat line
																					// (batting average, ERA) needs finer-grained
																					// decimals than a counting-stat one.
																					step="any"
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
														{(isPlayerSeasonOU || isTeamSeasonOU) && (
															<ChipField
																name="statAggregation"
																label="Total or per game"
																required
																options={[
																	["total", "Total"],
																	["per_game", "Per game"],
																]}
															/>
														)}
														{(isPlayerStatOU ||
															isTeamStatOU ||
															isPlayerSeasonOU ||
															isTeamSeasonOU ||
															isPlayerNumeric ||
															isTeamNumeric ||
															isTeamSeasonNumeric) && (
															<SubjectPicker
																teams={scopedTeams}
																players={scopedPlayers}
																kind={
																	isPlayerStatOU ||
																	isPlayerSeasonOU ||
																	isPlayerNumeric
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
														{isAnyOU ? "and subject" : "and subject"} - both
														pull from that league's catalog.
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
												<LeagueField sports={sports} />
												<GameField
													leagueId={leagueId}
													selectedGame={selectedGame}
													required
												/>
												<StatPicker
													stats={stats.filter(
														(s) =>
															s.appliesTo === "BOTH" ||
															s.appliesTo === "PLAYER",
													)}
												/>
												<OptionList
													items={scopedPlayers.map((player) => ({
														id: player.id,
														label: player.name,
														kind: "player" as const,
														meta: player.currentTeam?.abbreviation,
													}))}
													rowPlaceholder="Player name"
													addLabel="+ Add player"
													exactCount={2}
													rowLabels={["Player A", "Player B"]}
												/>
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													Both from this game - teammates or opponents, either
													works.
												</p>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isPlayerVsPlayerSeason && (
								<Section label="The comparison" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<StatPicker
													stats={stats.filter(
														(s) =>
															s.appliesTo === "BOTH" ||
															s.appliesTo === "PLAYER",
													)}
												/>
												<ChipField
													name="statAggregation"
													label="Total or per game"
													required
													options={[
														["total", "Total"],
														["per_game", "Per game"],
													]}
												/>
												<OptionList
													items={players.map((player) => ({
														id: player.id,
														label: player.name,
														kind: "player" as const,
														meta: player.currentTeam?.abbreviation,
													}))}
													rowPlaceholder="Player name"
													addLabel="+ Add player"
													exactCount={2}
													rowLabels={["Player A", "Player B"]}
												/>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isTeamVsTeamSeason && (
								<Section label="The comparison" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<StatPicker
													stats={stats.filter(
														(s) =>
															s.appliesTo === "BOTH" || s.appliesTo === "TEAM",
													)}
												/>
												<ChipField
													name="statAggregation"
													label="Total or per game"
													required
													options={[
														["total", "Total"],
														["per_game", "Per game"],
													]}
												/>
												<OptionList
													items={teams.map((team) => ({
														id: team.id,
														label: team.name,
														kind: "team" as const,
														meta: team.abbreviation,
													}))}
													rowPlaceholder="Team name"
													addLabel="+ Add team"
													exactCount={2}
													rowLabels={["Team A", "Team B"]}
												/>
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													Season-long, no game attached - any two teams in the
													league, division rivals or not.
												</p>
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
												<LeagueField sports={sports} />
												<GameField
													leagueId={leagueId}
													selectedGame={selectedGame}
													required
												/>
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													The two options are the game's own home and away teams
													- nothing to configure once a game's picked.
												</p>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isGameStatLeader && (
								<Section label="The stat leader" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<GameField
													leagueId={leagueId}
													selectedGame={selectedGame}
													required
												/>
												<StatPicker
													stats={stats.filter(
														(s) =>
															s.appliesTo === "BOTH" ||
															s.appliesTo === "PLAYER",
													)}
													catalogOnly
												/>
												{gameStatLeaderPoolItems === null ? (
													<FieldHint>Pick a game to see the pool.</FieldHint>
												) : (
													<PoolSummary
														items={gameStatLeaderPoolItems}
														scopeLabel={
															selectedGame
																? `${selectedGame.awayTeam.name} @ ${selectedGame.homeTeam.name}`
																: ""
														}
													/>
												)}
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													The pool is both teams' rosters - nothing to curate
													once a game's picked.
												</p>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isSeasonStatLeader && (
								<Section label="The stat leader" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<StatPicker
													stats={stats.filter(
														(s) =>
															s.appliesTo === "BOTH" ||
															s.appliesTo === "PLAYER",
													)}
												/>
												{offersStatAggregation && (
													<ChipField
														name="statAggregation"
														label="Total or per game"
														required
														options={[
															["total", "Total"],
															["per_game", "Per game"],
														]}
													/>
												)}
												<OptionList
													items={seasonStatLeaderItems}
													rowPlaceholder="Player name"
													addLabel="+ Add player"
												/>
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													Season-long, no game attached - name the players
													yourself, three or more. Off-catalog stats are allowed
													here, so advanced metrics work. For just two, use
													Player Season Head-to-Head instead.
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
												<LeagueField sports={sports} />
												<GameField
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
													teams={scopedTeams}
													players={scopedPlayers}
													kind="either"
												/>
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													Fixed at exactly two options - nothing else to
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
												<LeagueField sports={sports} />
												<HStack gap="3.5">
													<div className={css({ flex: "1" })}>
														<form.Field name="awardConferences">
															{(field) => (
																<VStack gap="1.5" alignItems="stretch">
																	<FieldLabel>Conference</FieldLabel>
																	<MultiSelect
																		value={field.value}
																		onValueChange={field.onChange}
																	>
																		<MultiSelect.Trigger>
																			{multiSelectSummary(
																				field.value,
																				"Whole league",
																			)}
																		</MultiSelect.Trigger>
																		<MultiSelect.Content>
																			{conferenceOptions.map((conference) => (
																				<MultiSelect.Option
																					key={conference}
																					value={conference}
																				>
																					{conference}
																				</MultiSelect.Option>
																			))}
																		</MultiSelect.Content>
																	</MultiSelect>
																</VStack>
															)}
														</form.Field>
													</div>
													<div className={css({ flex: "1" })}>
														<form.Field name="awardDivisions">
															{(field) => (
																<VStack gap="1.5" alignItems="stretch">
																	<FieldLabel>Division</FieldLabel>
																	<MultiSelect
																		value={field.value}
																		onValueChange={field.onChange}
																	>
																		<MultiSelect.Trigger>
																			{multiSelectSummary(
																				field.value,
																				awardConferences.length
																					? "Whole conference"
																					: "Pick a conference first",
																			)}
																		</MultiSelect.Trigger>
																		<MultiSelect.Content>
																			{divisionOptions.map((division) => (
																				<MultiSelect.Option
																					key={division}
																					value={division}
																				>
																					{division}
																				</MultiSelect.Option>
																			))}
																		</MultiSelect.Content>
																	</MultiSelect>
																</VStack>
															)}
														</form.Field>
													</div>
												</HStack>
												{isPlayerAward && (
													<form.Field name="awardPositions">
														{(field) => (
															<VStack gap="1.5" alignItems="stretch">
																<FieldLabel>Position</FieldLabel>
																<MultiSelect
																	value={field.value}
																	onValueChange={field.onChange}
																>
																	<MultiSelect.Trigger>
																		{multiSelectSummary(
																			field.value,
																			"Every position",
																		)}
																	</MultiSelect.Trigger>
																	<MultiSelect.Content>
																		{positionOptions.map((position) => (
																			<MultiSelect.Option
																				key={position}
																				value={position}
																			>
																				{position}
																			</MultiSelect.Option>
																		))}
																	</MultiSelect.Content>
																</MultiSelect>
															</VStack>
														)}
													</form.Field>
												)}
												{isPlayerAward && (
													<form.Field name="awardSeasonsInLeague">
														{(field) => (
															<VStack gap="1.5" alignItems="stretch">
																<FieldLabel>Years in the league</FieldLabel>
																<MultiSelect
																	value={field.value.map(String)}
																	onValueChange={(next) =>
																		field.onChange(next.map(Number))
																	}
																>
																	<MultiSelect.Trigger>
																		{multiSelectSummary(
																			field.value.map(String),
																			"Any experience",
																		)}
																	</MultiSelect.Trigger>
																	<MultiSelect.Content>
																		{yearsInLeagueOptions.map((years) => (
																			<MultiSelect.Option
																				key={years}
																				value={String(years)}
																			>
																				{yearsInLeagueLabel(years)}
																			</MultiSelect.Option>
																		))}
																	</MultiSelect.Content>
																</MultiSelect>
																<FieldHint>
																	Pick one or more exact years - e.g. "Rookie
																	(0)" for Rookie of the Year.
																</FieldHint>
															</VStack>
														)}
													</form.Field>
												)}
												{isPlayerAward && (
													<form.Field name="awardRookieOnly">
														{(field) => (
															<HStack
																justify="space-between"
																alignItems="center"
																gap="4"
															>
																<VStack gap="0.5" alignItems="flex-start">
																	<span
																		className={css({
																			fontSize: "sm",
																			fontWeight: "semibold",
																		})}
																	>
																		Rookie of the Year only
																	</span>
																	<span
																		className={css({
																			fontSize: "xs",
																			color: "fg.subtle",
																		})}
																	>
																		Narrows the pool to players who are actually
																		rookie-eligible this season, per this
																		sport's own real rule - not just "Years in
																		the league" = 0.
																	</span>
																</VStack>
																<button
																	type="button"
																	role="switch"
																	aria-checked={field.value}
																	aria-label="Rookie of the Year only"
																	onClick={() => {
																		const next = !field.value
																		field.onChange(next)
																		// Flipping this on always means the award is
																		// Rookie of the Year - only backfill the name
																		// when it's still blank so it doesn't clobber
																		// something the admin already typed (e.g. a
																		// per-position variant).
																		if (next && !awardName) {
																			form.setValue(
																				"awardName",
																				"Rookie of the Year",
																			)
																		}
																	}}
																	className={cx(
																		css({
																			position: "relative",
																			width: "42px",
																			height: "24px",
																			flexShrink: 0,
																			borderRadius: "full",
																			bg: "bg.subtle",
																			border: "1px solid",
																			borderColor: "border.default",
																			transition:
																				"background-color 0.15s ease, border-color 0.15s ease",
																			_after: {
																				content: '""',
																				position: "absolute",
																				top: "1px",
																				left: "1px",
																				width: "18px",
																				height: "18px",
																				borderRadius: "full",
																				bg: "fg.subtle",
																				transition:
																					"transform 0.15s ease, background-color 0.15s ease",
																			},
																		}),
																		field.value &&
																			css({
																				bg: "primary.subtle",
																				borderColor: "primary.default",
																				_after: {
																					transform: "translateX(18px)",
																					bg: "primary.default",
																				},
																			}),
																	)}
																/>
															</HStack>
														)}
													</form.Field>
												)}
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
												<ChipField
													name="awardVerb"
													label="Win or be"
													required
													hint={`"Win" for a single-winner race (MVP). "Be" for a role or slot (an All-NBA First Team spot, a positional Gold Glove).`}
													options={[
														["win", "Win"],
														["be", "Be"],
													]}
												/>
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
													<PoolSummary
														items={awardPoolItems}
														scopeLabel={[
															awardConferences.join("/"),
															awardDivisions.join("/"),
															awardPositions.join("/"),
															awardSeasonsInLeague
																.map(yearsInLeagueLabel)
																.join("/"),
														]
															.filter(Boolean)
															.join(" ")}
														rookieOnly={awardRookieOnly}
													/>
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
												<LeagueField sports={sports} />
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
													items={finalistItems}
													rowPlaceholder="Finalist name"
													addLabel="+ Add finalist"
												/>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{titlePreview !== null && (
								<Section label="Title">
									<Card>
										<Card.Body>
											<form.Field name="title">
												{(field) => (
													<TextInput
														error={field.meta.error ?? undefined}
														description="Prefilled from the fields above - edit it if the generated phrasing reads awkwardly."
													>
														<TextInput.Label required>Title</TextInput.Label>
														<TextInput.Group>
															<TextInput.Field
																value={field.value}
																onChange={(e) => {
																	setTitleEdited(true)
																	field.onChange(e)
																}}
																onBlur={field.onBlur}
															/>
														</TextInput.Group>
													</TextInput>
												)}
											</form.Field>
										</Card.Body>
									</Card>
								</Section>
							)}

							<Section label="Resolution" required>
								<Card>
									<Card.Body>
										<ResolutionFields leagueId={leagueId} />
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
														disabled={isAdminOnlyShape || !!ballotId}
													/>
												)}
											</form.Field>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isAdmin && (
								<Section label="Ballot">
									<Card>
										<Card.Body>
											<BallotField
												leagueId={leagueId}
												lockedBallotId={lockedBallotId}
											/>
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
		</FormProvider>
	)
}
