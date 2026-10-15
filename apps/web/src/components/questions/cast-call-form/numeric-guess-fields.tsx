import { basePointsFor } from "@called-my-shot/scoring"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GuessDistributionChart } from "#/components/questions/guess-distribution-chart"
import { PointsPreview } from "#/components/questions/points-preview"
import { SeasonPlayNote } from "#/components/questions/season-play-note"
import { Card } from "#/components/ui/card"
import { FieldLabel } from "#/components/ui/field-label"
import { Slider } from "#/components/ui/slider"
import { formatGuess } from "#/lib/field-signal"
import { CaseField } from "./case-field"
import { useCastCallFormContext } from "./cast-call-form-context"
import { GuessValueInput } from "./guess-value-input"
import { WinTotalTracker } from "./win-total-tracker"

// Every counting stat the numeric-guess shapes are used for (rebounds,
// points, passing yards) tops out in the low hundreds at most, so the
// stepper doesn't need anywhere near the reach a truly unbounded number
// input would want - ±25 already covers a full-field swing in one tap.
const COUNTING_GUESS_STEP_SIZES = [1, 5, 10, 25]
// A rate stat (batting average, ERA) lives on a 0-1ish scale, where even the
// smallest counting step above would blow past the entire realistic range in
// one tap - these mirror it at the right order of magnitude instead.
const RATE_GUESS_STEP_SIZES = [0.005, 0.01, 0.05]

const stepSizeButtonStyle = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	border: "1px solid {colors.border.default}",
	borderRadius: "sm",
	paddingInline: "2.5",
	paddingBlock: "1",
	cursor: "pointer",
	_hover: { color: "fg.default" },
})

// Filled/inverted, not just a border-color change - same treatment Tabs uses
// for its active trigger, which is the app's one other "pick one of these
// chips" control.
const stepSizeButtonActiveStyle = css({
	color: "bg.canvas",
	background: "fg.default",
	border: "1px solid {colors.fg.default}",
	_hover: { color: "bg.canvas" },
})

export function NumericGuessFields() {
	const {
		question,
		shape,
		form,
		toleranceBand,
		guessUnit,
		guessStep,
		setGuessStep,
		guessValue,
		guessBuckets,
		averageGuess,
		isRateStat,
		winTotalBudget,
	} = useCastCallFormContext()
	const numericConviction = form.useWatch("conviction")
	const stepSizes = isRateStat
		? RATE_GUESS_STEP_SIZES
		: COUNTING_GUESS_STEP_SIZES

	if (!question) return null

	return (
		<VStack gap="5" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch">
				<FieldLabel required>Make your guess</FieldLabel>
				<Card>
					<Card.Body>
						<VStack gap="4" alignItems="center">
							<form.Field name="guessValue">
								{(field) => (
									<GuessValueInput
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
										error={field.meta.error ?? null}
										guessStep={guessStep}
										isRateStat={isRateStat}
										guessUnit={guessUnit}
									/>
								)}
							</form.Field>
							<HStack gap="2" justify="center">
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "3xs",
										letterSpacing: "wide",
										color: "fg.subtle",
									})}
								>
									STEP
								</span>
								<HStack gap="1">
									{stepSizes.map((size) => (
										<button
											key={size}
											type="button"
											onClick={() => setGuessStep(size)}
											className={cx(
												stepSizeButtonStyle,
												guessStep === size && stepSizeButtonActiveStyle,
											)}
										>
											±{size}
										</button>
									))}
								</HStack>
							</HStack>
							{winTotalBudget && guessValue !== undefined && (
								<WinTotalTracker budget={winTotalBudget} guess={guessValue} />
							)}
							{toleranceBand !== null && (
								<VStack
									gap="0.5"
									alignItems="center"
									// Extra room below, not just the card's shared gap - the
									// chart's own "field avg" label floats upward past its box
									// (see the avg-marker's negative offset in
									// GuessDistributionChart) to sit above the bars, which eats
									// into whatever gap is here. Without real clearance this
									// text reads as running straight into "field avg" below it.
									className={css({ paddingBottom: "3" })}
								>
									<span
										className={css({
											textStyle: "metaLg",
											color: "secondary.default",
											textAlign: "center",
										})}
									>
										counts as a hit if the actual lands within ±
										{formatGuess(toleranceBand, isRateStat)} of this
									</span>
									<span
										className={css({
											textStyle: "metaSm",
											color: "fg.subtle",
											textAlign: "center",
										})}
									>
										(based on your guess - the real band is set from the actual
										result once it's posted)
									</span>
								</VStack>
							)}
							<div className={css({ alignSelf: "stretch" })}>
								<GuessDistributionChart
									buckets={guessBuckets}
									averageGuess={averageGuess}
									myGuess={guessValue ?? null}
									isRateStat={isRateStat}
								/>
							</div>
						</VStack>
					</Card.Body>
				</Card>
			</VStack>
			<Card>
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<form.Field name="conviction">
							{(field) => (
								<VStack gap="1.5" alignItems="stretch">
									<HStack justify="space-between">
										<FieldLabel required>Conviction</FieldLabel>
										<span className={css({ textStyle: "metaLg" })}>
											{field.value}%
										</span>
									</HStack>
									<Slider
										value={field.value ?? 50}
										onChange={field.onChange}
										aria-label="Conviction"
									/>
								</VStack>
							)}
						</form.Field>
						<PointsPreview
							kind="numeric"
							conviction={numericConviction ?? 50}
							basePoints={
								basePointsFor({
									shape,
									isOfficial: question.isOfficial,
									isPriced: question.isPriced,
								}) * (question.viewerSeasonPlay?.weight ?? 1)
							}
							lossRate={question.lossRate}
						/>
						{question.viewerSeasonPlay && (
							<SeasonPlayNote
								play={question.viewerSeasonPlay}
								league={question.league.abbreviation}
							/>
						)}
					</VStack>
				</Card.Body>
			</Card>
			<CaseField />
		</VStack>
	)
}
