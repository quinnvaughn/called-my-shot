import { VStack } from "styled-system/jsx"
import { TextInput } from "#/components/ui/text-input"
import { optionDisplayLabel } from "#/lib/question-labels"
import {
	isOverUnderShape,
	type QuestionCallShape,
} from "./cast-call-form/use-cast-call-form"
import { OptionRow } from "./option-row"

type Props = {
	shape: QuestionCallShape
	ouLine: number | null
	options: { id: string; label: string }[]
	correctOptionIds: string[]
	onToggleOption: (optionId: string) => void
	actualValue: number | undefined
	onActualValueChange: (value: number | undefined) => void
	actualValueError?: string
	// True only for a rate stat (batting average, ERA) - see formatGuess in
	// #/lib/field-signal.
	isRateStat?: boolean
}

// The outcome-picking half of a resolve form (option pool vs. number input,
// branched by question shape) - shared by the creator's ResolveQuestionModal
// and the admin resolve/overturn modals, since the scoring-outcome UI is
// identical across all three; only the mutation and surrounding copy differ.
export function ResolveOutcomeFields({
	shape,
	ouLine,
	options,
	correctOptionIds,
	onToggleOption,
	actualValue,
	onActualValueChange,
	actualValueError,
	isRateStat = false,
}: Props) {
	if (
		shape === "player_stat_numeric_guess" ||
		shape === "team_stat_numeric_guess"
	) {
		return (
			<TextInput error={actualValueError}>
				<TextInput.Label required>Actual value</TextInput.Label>
				<TextInput.Group>
					<TextInput.Field
						type="number"
						// "any" rather than a fixed step - a rate stat's actual value
						// (batting average, ERA) needs decimals a step of 1 would
						// otherwise reject via native constraint validation.
						step="any"
						value={actualValue ?? ""}
						onChange={(e) =>
							onActualValueChange(
								e.target.value === "" ? undefined : Number(e.target.value),
							)
						}
					/>
				</TextInput.Group>
			</TextInput>
		)
	}

	return (
		<VStack gap="2" alignItems="stretch">
			{options.map((option) => (
				<OptionRow
					key={option.id}
					label={optionDisplayLabel(
						option.label,
						isOverUnderShape(shape),
						ouLine,
						isRateStat,
					)}
					fieldPct={null}
					selected={correctOptionIds.includes(option.id)}
					onClick={() => onToggleOption(option.id)}
				/>
			))}
		</VStack>
	)
}
