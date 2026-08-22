import { VStack } from "styled-system/jsx"
import { TextInput } from "#/components/ui/text-input"
import { OptionRow } from "./option-row"

type QuestionShape =
	| "player_stat_over_under"
	| "team_stat_over_under"
	| "player_season_stat_over_under"
	| "team_season_stat_over_under"
	| "game_total_over_under"
	| "player_stat_numeric_guess"
	| "team_stat_numeric_guess"
	| "player_vs_player"
	| "player_vs_player_season"
	| "team_vs_team"
	| "yes_no_prop"
	| "player_season_award"
	| "team_season_award"
	| "player_award_finalists"

type Props = {
	shape: QuestionShape
	ouLine: number | null
	options: { id: string; label: string }[]
	correctOptionIds: string[]
	onToggleOption: (optionId: string) => void
	actualValue: number | undefined
	onActualValueChange: (value: number | undefined) => void
	actualValueError?: string
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
						(shape === "player_stat_over_under" ||
							shape === "team_stat_over_under" ||
							shape === "player_season_stat_over_under" ||
							shape === "team_season_stat_over_under" ||
							shape === "game_total_over_under") &&
						ouLine !== null
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
