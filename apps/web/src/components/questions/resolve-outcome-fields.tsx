import { VStack } from "styled-system/jsx"
import { TextInput } from "#/components/ui/text-input"
import { OptionRow } from "./option-row"

type QuestionType =
	| "multiple_choice"
	| "yes_no"
	| "over_under"
	| "numeric_guess"
	| "multi_select"

type Props = {
	type: QuestionType
	ouLine: number | null
	options: { id: string; label: string }[]
	correctOptionIds: string[]
	onToggleOption: (optionId: string) => void
	actualValue: number | undefined
	onActualValueChange: (value: number | undefined) => void
	actualValueError?: string
}

// The outcome-picking half of a resolve form (option pool vs. number input,
// branched by question type) - shared by the creator's ResolveQuestionModal
// and the admin resolve/overturn modals, since the scoring-outcome UI is
// identical across all three; only the mutation and surrounding copy differ.
export function ResolveOutcomeFields({
	type,
	ouLine,
	options,
	correctOptionIds,
	onToggleOption,
	actualValue,
	onActualValueChange,
	actualValueError,
}: Props) {
	if (type === "numeric_guess") {
		return (
			<TextInput error={actualValueError}>
				<TextInput.Label required>Actual value</TextInput.Label>
				<TextInput.Group>
					<TextInput.Field
						type="number"
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
					label={
						type === "over_under" && ouLine !== null
							? `${option.label} ${ouLine}`
							: option.label
					}
					fieldPct={null}
					selected={correctOptionIds.includes(option.id)}
					onClick={() => onToggleOption(option.id)}
				/>
			))}
		</VStack>
	)
}
