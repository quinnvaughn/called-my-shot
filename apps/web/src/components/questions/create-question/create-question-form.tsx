import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { TextInput } from "#/components/ui/text-input"
import type { SportsQuery } from "#/graphql/generated/graphql"
import { BallotField } from "./ballot-field"
import { QuestionDataProvider } from "./data-context"
import { Field, FormProvider, Subscribe } from "./form-context"
import { OfficialToggle } from "./official-toggle"
import { QuestionTypePicker } from "./question-type-picker"
import { ResolutionFields } from "./resolution-fields"
import { Section } from "./section"
import { AwardPanel } from "./shape-panels/award-panel"
import { FinalistsPanel } from "./shape-panels/finalists-panel"
import { HeadToHeadPanel } from "./shape-panels/head-to-head-panel"
import { MatchupPanel } from "./shape-panels/matchup-panel"
import {
	GameStatLeaderPanel,
	SeasonStatLeaderPanel,
} from "./shape-panels/stat-leader-panels"
import { StatPanel } from "./shape-panels/stat-panel"
import { YesNoPanel } from "./shape-panels/yes-no-panel"
import { useCreateQuestionForm } from "./use-create-question-form"

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
		ballotId,
		hasSelectedType,
		selectType,
		setTitleEdited,
		titlePreview,
		isAdminOnlyShape,
		data,
	} = useCreateQuestionForm()

	return (
		<FormProvider form={form}>
			<QuestionDataProvider value={{ ...data, sports, isAdmin }}>
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
								{match(shape)
									.with(
										"player_stat_over_under",
										"team_stat_over_under",
										"player_season_stat_over_under",
										"team_season_stat_over_under",
										"game_total_over_under",
										"player_stat_numeric_guess",
										"team_stat_numeric_guess",
										"team_season_stat_numeric_guess",
										// No key: this panel spans eight shapes and must not
										// remount between them, matching the single JSX branch
										// they all used to share.
										(s) => <StatPanel shape={s} />,
									)
									.with(
										"player_vs_player",
										"player_vs_player_season",
										"team_vs_team_season",
										// Keyed, unlike StatPanel: these three were separate JSX
										// branches, so switching between them remounted
										// LeagueField and StatPicker and cleared their typed-in
										// text. Merging them into one component would silently
										// start preserving it without this.
										(s) => <HeadToHeadPanel key={s} shape={s} />,
									)
									.with("team_vs_team", () => <MatchupPanel />)
									.with("player_game_stat_leader", () => (
										<GameStatLeaderPanel />
									))
									.with("player_season_stat_leader", () => (
										<SeasonStatLeaderPanel />
									))
									.with("yes_no_prop", () => <YesNoPanel />)
									// No key, same reasoning as StatPanel: these two shared one
									// branch, so switching between them kept the league and
									// award-name text already typed in.
									.with("player_season_award", "team_season_award", (s) => (
										<AwardPanel shape={s} />
									))
									.with("player_award_finalists", () => <FinalistsPanel />)
									.exhaustive()}

								{titlePreview !== null && (
									<Section label="Title">
										<Card>
											<Card.Body>
												<Field name="title">
													{(field) => (
														<TextInput
															error={field.meta.error ?? undefined}
															description="Prefilled from the fields above - edit it if the generated phrasing reads awkwardly."
														>
															<TextInput.Label required>Title</TextInput.Label>
															<TextInput.Group>
																<TextInput.Field
																	value={field.value}
																	// Raw Field rather than TextField: this has to
																	// flag the title as the creator's before the
																	// value lands, and the kit's onValueChange
																	// fires after.
																	onChange={(e) => {
																		setTitleEdited(true)
																		field.onChange(e)
																	}}
																	onBlur={field.onBlur}
																/>
															</TextInput.Group>
														</TextInput>
													)}
												</Field>
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
												<Field name="isOfficial">
													{(field) => (
														<OfficialToggle
															checked={!!field.value}
															onChange={(checked) => field.onChange(checked)}
															disabled={isAdminOnlyShape || !!ballotId}
														/>
													)}
												</Field>
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

								<Subscribe selector={(s) => s.meta}>
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
								</Subscribe>
							</>
						)}
					</VStack>
				</form>
			</QuestionDataProvider>
		</FormProvider>
	)
}
