import { BASE_POINTS_BY_SHAPE } from "@called-my-shot/scoring"
import { FiMinus, FiPlus } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { Slider } from "#/components/ui/slider"
import { GuessDistributionChart } from "../guess-distribution-chart"
import { PointsPreview } from "../points-preview"
import { CaseField } from "./case-field"
import type { CastCallFormState } from "./use-cast-call-form"

// Every stat the numeric-guess shapes are used for (rebounds, points, passing
// yards) tops out in the low hundreds at most, so the stepper doesn't need
// anywhere near the reach a truly unbounded number input would want - ±25
// already covers a full-field swing in one tap.
const GUESS_STEP_SIZES = [1, 5, 10, 25]

const stepButtonStyle = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "11",
	height: "11",
	flexShrink: "0",
	borderRadius: "lg",
	border: "1px solid {colors.border.default}",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: {
		border: "1px solid {colors.border.emphasized}",
		color: "fg.default",
	},
})

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

const guessUnitStyle = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	textTransform: "uppercase",
	border: "1px solid {colors.border.default}",
	borderRadius: "sm",
	paddingInline: "2",
	paddingBlock: "1",
})

type Props = {
	callForm: CastCallFormState
}

export function NumericGuessFields({ callForm }: Props) {
	const {
		shape,
		form,
		toleranceBand,
		guessUnit,
		guessStep,
		setGuessStep,
		guessValue,
		guessBuckets,
		averageGuess,
	} = callForm
	const numericConviction = form.useWatch("conviction")

	return (
		<VStack gap="5" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch">
				<FieldLabel required>Make your guess</FieldLabel>
				<Card>
					<Card.Body>
						<VStack gap="4" alignItems="center">
							<form.Field name="guessValue">
								{(field) => (
									<VStack gap="3" alignItems="center">
										{/* Tight on purpose - the unit is labeling the number
										right above it, not an independent block, so it gets its
										own small gap instead of inheriting the card's looser one. */}
										<VStack gap="1" alignItems="center">
											<HStack gap="3" alignItems="center" justify="center">
												<button
													type="button"
													aria-label="Decrease guess"
													onClick={() =>
														field.onChange(
															Math.max(0, (field.value ?? 0) - guessStep),
														)
													}
													className={stepButtonStyle}
												>
													<FiMinus size={18} />
												</button>
												<input
													type="text"
													inputMode="numeric"
													pattern="[0-9]*"
													aria-label="Your guess"
													value={field.value ?? ""}
													onChange={(e) => {
														const digits = e.target.value.replace(/[^0-9]/g, "")
														field.onChange(
															digits === "" ? undefined : Number(digits),
														)
													}}
													onBlur={field.onBlur}
													// ch tracks the actual digit count (min 2) so a
													// 3-digit passing-yards guess gets more room than a
													// 2-digit rebounds one instead of both fighting a
													// fixed width.
													style={{
														width: `${Math.max(2, String(field.value ?? "").length) + 1}ch`,
													}}
													className={css({
														flexShrink: "0",
														textAlign: "center",
														fontFamily: "heading",
														fontSize: "5xl",
														background: "transparent",
														border: "none",
														outline: "none",
														color: "fg.default",
													})}
												/>
												<button
													type="button"
													aria-label="Increase guess"
													onClick={() =>
														field.onChange((field.value ?? 0) + guessStep)
													}
													className={stepButtonStyle}
												>
													<FiPlus size={18} />
												</button>
											</HStack>
											{guessUnit && (
												<span className={guessUnitStyle}>{guessUnit}</span>
											)}
										</VStack>
										<FormError message={field.meta.error ?? null} />
									</VStack>
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
									{GUESS_STEP_SIZES.map((size) => (
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
											fontFamily: "mono",
											fontSize: "xs",
											color: "success.default",
											textAlign: "center",
										})}
									>
										counts as a hit if the actual lands within ±{toleranceBand}{" "}
										of this
									</span>
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "3xs",
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
										<span
											className={css({ fontFamily: "mono", fontSize: "xs" })}
										>
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
							basePoints={BASE_POINTS_BY_SHAPE[shape]}
						/>
					</VStack>
				</Card.Body>
			</Card>
			<CaseField callForm={callForm} />
		</VStack>
	)
}
