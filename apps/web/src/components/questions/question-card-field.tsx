import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { formatGuess } from "#/lib/field-signal"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"
import { GuessDistributionChart } from "./guess-distribution-chart"
import { OptionRow } from "./option-row"

type Option = {
	id: string
	label: string
	fieldPct: number | null
	callCount: number
}

type Props = {
	shape: QuestionShape
	options: Option[]
	ouLine: number | null
	isRateStat: boolean
	guessDistribution: { value: number; count: number }[]
	averageGuess: number | null
	// The viewer's own call: its picked option ids for an option shape, its
	// guessValue for a numeric one. Empty / null when they haven't called.
	pickedOptionIds: string[]
	myGuess: number | null
	// How many winners a season award asks callers to pick. Above 1, the card
	// shows that many rows so the field's whole lineup is visible.
	picksRequired: number | null
}

// A single-pick stat leader or award question carries a whole roster or
// league of options, so the card shows only the most-called few.
const MAX_RANKED_ROWS = 3

const mutedMonoClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	color: "fg.subtle",
})

// How the field is calling a still-unsettled question, shown on QuestionCard
// itself: every option's share for a two-way question, the top few for a
// many-option one, and the guess histogram for a numeric one.
export function QuestionCardField({
	shape,
	options,
	ouLine,
	isRateStat,
	guessDistribution,
	averageGuess,
	pickedOptionIds,
	myGuess,
	picksRequired,
}: Props) {
	const renderRow = (option: Option) => (
		<OptionRow
			key={option.id}
			label={optionDisplayLabel(
				option.label,
				isOverUnderQuestionShape(shape),
				ouLine,
				isRateStat,
			)}
			fieldPct={option.fieldPct}
			count={option.callCount}
			selected={pickedOptionIds.includes(option.id)}
		/>
	)

	return match(shape)
		.with(
			"TEAM_VS_TEAM",
			"TEAM_VS_TEAM_SEASON",
			"PLAYER_VS_PLAYER",
			"PLAYER_VS_PLAYER_SEASON",
			"YES_NO_PROP",
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"PLAYER_SEASON_STAT_OVER_UNDER",
			"TEAM_SEASON_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			() => (
				<VStack gap="2" alignItems="stretch">
					{options.map(renderRow)}
				</VStack>
			),
		)
		.with(
			"PLAYER_GAME_STAT_LEADER",
			"PLAYER_SEASON_STAT_LEADER",
			"PLAYER_SEASON_AWARD",
			"TEAM_SEASON_AWARD",
			"PLAYER_AWARD_FINALISTS",
			() => {
				// Same ranking as OptionFieldBreakdown: most-called first, uncalled
				// options dropped unless they're the viewer's own pick.
				const ranked = options
					.filter(
						(option) =>
							option.callCount > 0 || pickedOptionIds.includes(option.id),
					)
					.sort((a, b) => b.callCount - a.callCount)
				if (ranked.length === 0) {
					return <span className={mutedMonoClass}>No callers yet</span>
				}
				const isMultiPick = picksRequired !== null && picksRequired > 1
				const rowCount = isMultiPick ? picksRequired : MAX_RANKED_ROWS
				const top = ranked.slice(0, rowCount)
				const picksBelowTop = ranked
					.slice(rowCount)
					.filter((option) => pickedOptionIds.includes(option.id))
				// A single pick outside the top rows gets a row of its own. A
				// multi-pick caller can have several out there, so those collapse
				// to one line of names rather than doubling the card's length.
				const rows = isMultiPick ? top : [...top, ...picksBelowTop]
				const hiddenCount = ranked.length - top.length - picksBelowTop.length
				return (
					<VStack gap="2" alignItems="stretch">
						{rows.map(renderRow)}
						{isMultiPick && picksBelowTop.length > 0 && (
							<span className={mutedMonoClass}>
								Also yours:{" "}
								<span className={css({ color: "primary.default" })}>
									{picksBelowTop.map((option) => option.label).join(", ")}
								</span>
							</span>
						)}
						{hiddenCount > 0 && (
							<span className={mutedMonoClass}>+{hiddenCount} more</span>
						)}
					</VStack>
				)
			},
		)
		.with(
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_NUMERIC_GUESS",
			"TEAM_SEASON_STAT_NUMERIC_GUESS",
			() => (
				<VStack gap="2" alignItems="stretch">
					<GuessDistributionChart
						buckets={guessDistribution}
						averageGuess={averageGuess}
						myGuess={myGuess}
						isRateStat={isRateStat}
						compact
					/>
					{myGuess !== null && (
						<HStack gap="1.5" alignItems="baseline">
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "3xs",
									letterSpacing: "wide",
									textTransform: "uppercase",
									color: "fg.subtle",
								})}
							>
								Your guess
							</span>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "sm",
									fontWeight: "bold",
									color: "primary.default",
								})}
							>
								{formatGuess(myGuess, isRateStat)}
							</span>
						</HStack>
					)}
				</VStack>
			),
		)
		.exhaustive()
}
