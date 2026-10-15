import { useId } from "react"
import { VStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { NumberStepper } from "#/components/ui/number-stepper"
import { formatGuess, isRateToleranceTier } from "#/lib/field-signal"
import { useQuestionData } from "./data-context"
import { Field, useWatch } from "./form-context"
import { suggestLine } from "./suggest-line"

// Every counting stat an over/under is set on tops out in the low hundreds, so
// these cover a full swing in a tap or two without needing the reach an
// unbounded input would want.
const COUNTING_STEP_SIZES = [1, 5, 10, 25]
// A rate stat (batting average, ERA) lives on a 0-1ish scale, where even the
// smallest counting step above would blow past the whole realistic range in
// one tap - these mirror it at the right order of magnitude instead.
const RATE_STEP_SIZES = [0.005, 0.01, 0.05]

// The over/under line. A stepper rather than a bare number input for two
// reasons: a native spinner moves by 1, which is useless against a 249.5-yard
// line, and - for a counting stat - stepping by whole numbers off a half-point
// base makes the illegal whole-number line unreachable instead of merely
// rejected after the fact.
export function LineField() {
	const hintId = useId()
	const shape = useWatch("shape")
	const statId = useWatch("statId")
	const statAggregation = useWatch("statAggregation")
	const { stats } = useQuestionData("LineField")

	// Derived here rather than read off useQuestionData: that context
	// deliberately carries no watched form scalar, so that typing in one field
	// doesn't churn it and re-render every panel.
	const selectedStat = statId
		? stats.find((stat) => stat.id === statId)
		: undefined
	const isRate = isRateToleranceTier(selectedStat?.toleranceTier)

	// A placeholder, never a value: the line is the substance of the question,
	// so it stays the creator's call. This only says what magnitude the stat
	// lives at, so the field isn't a blank stare.
	const suggestion = suggestLine({
		shape,
		stat: selectedStat,
		statAggregation,
	})

	return (
		<VStack gap="2.5" alignItems="stretch">
			<FieldLabel required>Number</FieldLabel>
			<Field name="ouLine">
				{(field) => (
					<>
						<NumberStepper
							// Remounts when the stat flips between rate and counting, so
							// the active step chip resets to one that makes sense for the
							// new scale instead of keeping ±25 for a batting average.
							key={isRate ? "rate" : "counting"}
							ariaLabel="Number"
							describedBy={hintId}
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
							hasError={Boolean(field.meta.error)}
							unit={selectedStat?.name}
							placeholder={
								suggestion === undefined
									? undefined
									: formatGuess(suggestion, isRate)
							}
							stepSizes={isRate ? RATE_STEP_SIZES : COUNTING_STEP_SIZES}
							snap={isRate ? "none" : "half"}
							min={isRate ? 0 : 0.5}
							inputMode={isRate ? "decimal" : "numeric"}
						/>
						<FormError message={field.meta.error ?? null} />
					</>
				)}
			</Field>
			<FieldHint id={hintId}>
				{isRate
					? "Can't be a whole number - the result has to be able to land on one side or the other, never exactly on it."
					: "Lands on a half point, so the result always falls on one side or the other."}
			</FieldHint>
		</VStack>
	)
}
