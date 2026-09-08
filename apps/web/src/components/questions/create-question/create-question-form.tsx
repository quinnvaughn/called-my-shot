import { VStack } from "styled-system/jsx"
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
import { ShapePanelFor } from "./shape-panels/shape-panel-for"
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
								<ShapePanelFor shape={shape} />

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
