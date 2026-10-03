import { VStack } from "styled-system/jsx"
import {
	type ImagePlayer,
	type ImageTeam,
	PlayerOrTeamImage,
} from "#/components/ui/player-or-team-image"
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
	options: {
		id: string
		label: string
		// Set when the option is a real player or team, for its image.
		player?: ImagePlayer | null
		team?: ImageTeam | null
	}[]
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
	const numberField = (required: boolean) => (
		<TextInput error={actualValueError}>
			<TextInput.Label required={required}>Actual value</TextInput.Label>
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

	if (
		shape === "player_stat_numeric_guess" ||
		shape === "team_stat_numeric_guess" ||
		shape === "team_season_stat_numeric_guess"
	) {
		return numberField(true)
	}

	return (
		<VStack gap="2" alignItems="stretch">
			{options.map((option) => (
				<OptionRow
					key={option.id}
					image={
						<PlayerOrTeamImage player={option.player} team={option.team} />
					}
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
			{/* Optional, unlike the numeric-guess field above: the side that hit
			    is what scores an over/under, and the number only decides which
			    side that was. Supplying it lets the settled question state what
			    the subject actually did instead of just which way it went - the
			    ESPN resolvers always record it, so this is the one path that
			    could otherwise leave it blank. */}
			{isOverUnderShape(shape) && numberField(false)}
		</VStack>
	)
}
