import { basePointsFor } from "@called-my-shot/scoring"
import { useEffect, useState } from "react"
import { FiMinus, FiPlus } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { Slider } from "#/components/ui/slider"
import { formatGuess } from "#/lib/field-signal"
import {
	type WinTotalBudget,
	winTotalTrackerLine,
} from "#/lib/win-total-tracker"
import { GuessDistributionChart } from "../guess-distribution-chart"
import { PointsPreview } from "../points-preview"
import { CaseField } from "./case-field"
import type { CastCallFormState } from "./use-cast-call-form"

// Every counting stat the numeric-guess shapes are used for (rebounds,
// points, passing yards) tops out in the low hundreds at most, so the
// stepper doesn't need anywhere near the reach a truly unbounded number
// input would want - ±25 already covers a full-field swing in one tap.
const COUNTING_GUESS_STEP_SIZES = [1, 5, 10, 25]
// A rate stat (batting average, ERA) lives on a 0-1ish scale, where even the
// smallest counting step above would blow past the entire realistic range in
// one tap - these mirror it at the right order of magnitude instead.
const RATE_GUESS_STEP_SIZES = [0.005, 0.01, 0.05]

// Guards against floating-point drift from repeated decimal stepping (e.g.
// 0.27 + 0.01 landing on 0.28000000000000003) - rounds to the same 3 decimal
// places the guessValue column itself stores.
function roundGuess(value: number): number {
	return Math.round(value * 1000) / 1000
}

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

// Pulled out to its own top-level component (rather than a closure inside
// form.Field's render callback) because it needs its own hooks - a rate stat
// (batting average, ERA) needs a raw text buffer, not a value purely derived
// from the numeric field value, since round-tripping "0." through Number()
// on every keystroke would immediately drop the trailing "." and make it
// impossible to ever type the fractional part.
function GuessValueInput({
	value,
	onChange,
	onBlur,
	error,
	guessStep,
	isRateStat,
	guessUnit,
}: {
	value: number | undefined
	onChange: (value: number | undefined) => void
	onBlur: () => void
	error: string | null
	guessStep: number
	isRateStat: boolean
	guessUnit: string | null
}) {
	const [text, setText] = useState(() => String(value ?? ""))
	useEffect(() => {
		setText(String(value ?? ""))
		// Only resync from external value changes (stepper clicks, form
		// reset) - commitText below is what drives typing itself.
	}, [value])

	function commitText(raw: string) {
		let cleaned = raw.replace(isRateStat ? /[^0-9.]/g : /[^0-9]/g, "")
		if (isRateStat) {
			const firstDot = cleaned.indexOf(".")
			if (firstDot !== -1) {
				cleaned =
					cleaned.slice(0, firstDot + 1) +
					cleaned.slice(firstDot + 1).replace(/\./g, "")
			}
		}
		setText(cleaned)
		const parsed = Number(cleaned)
		onChange(
			cleaned === "" || cleaned === "." || Number.isNaN(parsed)
				? undefined
				: parsed,
		)
	}

	return (
		<VStack gap="3" alignItems="center">
			{/* Tight on purpose - the unit is labeling the number right above
			it, not an independent block, so it gets its own small gap instead
			of inheriting the card's looser one. */}
			<VStack gap="1" alignItems="center">
				<HStack gap="3" alignItems="center" justify="center">
					<button
						type="button"
						aria-label="Decrease guess"
						onClick={() =>
							onChange(Math.max(0, roundGuess((value ?? 0) - guessStep)))
						}
						className={stepButtonStyle}
					>
						<FiMinus size={18} />
					</button>
					<input
						type="text"
						inputMode={isRateStat ? "decimal" : "numeric"}
						pattern={isRateStat ? undefined : "[0-9]*"}
						aria-label="Your guess"
						value={text}
						onChange={(e) => commitText(e.target.value)}
						// Select-all on focus so typing replaces the current guess
						// instead of appending to it. Deferred a frame because the
						// click that focused the input would otherwise place the
						// caret after select() runs and collapse the selection.
						onFocus={(e) => {
							const input = e.currentTarget
							requestAnimationFrame(() => input.select())
						}}
						onBlur={onBlur}
						// ch tracks the actual character count (min 2) so a
						// 3-digit passing-yards guess gets more room than a
						// 2-digit rebounds one, or a rate-stat guess room for
						// its decimal point, instead of all of them fighting a
						// fixed width.
						style={{
							width: `${Math.max(2, text.length) + 1}ch`,
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
						onClick={() => onChange(roundGuess((value ?? 0) + guessStep))}
						className={stepButtonStyle}
					>
						<FiPlus size={18} />
					</button>
				</HStack>
				{guessUnit && <span className={guessUnitStyle}>{guessUnit}</span>}
			</VStack>
			<FormError message={error} />
		</VStack>
	)
}

// Where this pick puts the viewer's win-totals ballot against the wins the
// schedule actually hands out, updating as the guess moves.
function WinTotalTracker({
	budget,
	guess,
}: {
	budget: WinTotalBudget
	guess: number
}) {
	const { text, off } = winTotalTrackerLine(budget, guess)
	return (
		<span
			className={css({
				fontSize: "sm",
				textAlign: "center",
				color: off ? "warning.default" : "fg.muted",
				maxWidth: "md",
			})}
		>
			{text}
		</span>
	)
}

export function NumericGuessFields({ callForm }: Props) {
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
	} = callForm
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
											fontFamily: "mono",
											fontSize: "xs",
											color: "secondary.default",
											textAlign: "center",
										})}
									>
										counts as a hit if the actual lands within ±
										{formatGuess(toleranceBand, isRateStat)} of this
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
							basePoints={basePointsFor({ shape, isOfficial: question.isOfficial })}
							lossRate={question.lossRate}
						/>
					</VStack>
				</Card.Body>
			</Card>
			<CaseField callForm={callForm} />
		</VStack>
	)
}
