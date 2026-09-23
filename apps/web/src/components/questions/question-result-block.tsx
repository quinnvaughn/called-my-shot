import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Tag } from "#/components/ui/tag"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	callersText,
	isRateStat as computeIsRateStat,
	formatGuess,
} from "#/lib/field-signal"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"
import { DisputedFlag } from "./disputed-flag"

type Option = {
	id: string
	label: string
	fieldPct: number | null
	isCorrect: boolean | null
	// What this option's own subject put up - set on the shapes graded by
	// comparing the options, null everywhere else. See
	// questionOptions.actualValue in the API.
	actualValue: number | null
}

type Props = {
	question: {
		shape: QuestionShape
		numericActualValue: number | null
		callCount: number
		averageGuess: number | null
		numericToleranceAbsolute: number | null
		// An over/under shape has no tolerance snapshot at all, so rate-ness
		// there is read off the picked stat's own tolerance tier instead - see
		// isRateStat in #/lib/field-signal.
		stat: {
			toleranceTier: { toleranceMode: string; toleranceValue: number } | null
		} | null
		ouLine: number | null
		options: Option[]
	}
	// A dispute still carries the prior resolution's value/sub-line - the
	// flag renders above it, and the label swaps from "Result"/FINAL to
	// "Flagged result" with no badge.
	disputed: boolean
}

const valueClass = css({
	display: "block",
	fontSize: "lg",
	fontWeight: "bold",
	color: "fg.default",
})

const subClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	color: "fg.subtle",
})

// QuestionCard's resolved (or disputed) state - the actual answer plus how
// the field did against it, replacing the in-progress signal/lock-countdown
// row once there's a result to report.
export function QuestionResultBlock({ question, disputed }: Props) {
	const winner = question.options.find((o) => o.isCorrect)
	const winners = question.options.filter((o) => o.isCorrect)
	const callers = callersText(question.callCount)
	const isRateStat = computeIsRateStat(question)
	// "144 to 118" - the two sides of a head-to-head in winner-first order, so
	// the result states the margin and not just who took it. Null whenever
	// either number is missing, which is every shape that shares this branch
	// without being a comparison of numbers (Yes/No, finalists) and any
	// matchup a person resolved by hand.
	const headToHeadScore = (() => {
		if (question.options.length !== 2) return null
		const loser = question.options.find((o) => o.id !== winner?.id)
		if (winner?.actualValue == null || loser?.actualValue == null) return null
		return `${formatGuess(winner.actualValue, isRateStat)} to ${formatGuess(loser.actualValue, isRateStat)}`
	})()
	const winnerSub =
		winner?.fieldPct !== undefined && winner.fieldPct !== null
			? `${Math.round(winner.fieldPct)}% of the field called it right · ${callers}`
			: callers

	return (
		<VStack gap="2" alignItems="stretch">
			{disputed && <DisputedFlag />}
			<HStack justify="space-between" alignItems="center">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "3xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.subtle",
					})}
				>
					{disputed ? "Flagged result" : "Result"}
				</span>
				{/* Neutral, not success: this marks the result as settled, and it
				    renders over a lost call just as readily as a won one. */}
				{!disputed && (
					<Tag variant="neutral" size="sm">
						Final
					</Tag>
				)}
			</HStack>
			{match(question.shape)
				.with(
					"PLAYER_STAT_NUMERIC_GUESS",
					"TEAM_STAT_NUMERIC_GUESS",
					"TEAM_SEASON_STAT_NUMERIC_GUESS",
					() => (
						<VStack gap="1.5" alignItems="stretch">
							<span className={valueClass}>
								{question.numericActualValue !== null
									? formatGuess(question.numericActualValue, isRateStat)
									: "-"}
							</span>
							<span className={subClass}>
								{question.averageGuess !== null
									? `avg guess was ${formatGuess(question.averageGuess, isRateStat)} · ${callers}`
									: callers}
							</span>
						</VStack>
					),
				)
				.with(
					"PLAYER_STAT_OVER_UNDER",
					"TEAM_STAT_OVER_UNDER",
					"PLAYER_SEASON_STAT_OVER_UNDER",
					"TEAM_SEASON_STAT_OVER_UNDER",
					"GAME_TOTAL_OVER_UNDER",
					() => (
						<VStack gap="1.5" alignItems="stretch">
							<span className={valueClass}>
								{winner
									? `${optionDisplayLabel(winner.label, isOverUnderQuestionShape(question.shape), question.ouLine, isRateStat)}${
											question.numericActualValue !== null
												? `: actual ${formatGuess(question.numericActualValue, isRateStat)}`
												: ""
										}`
									: "-"}
							</span>
							<span className={subClass}>{winnerSub}</span>
						</VStack>
					),
				)
				.with(
					"PLAYER_VS_PLAYER",
					"PLAYER_VS_PLAYER_SEASON",
					"TEAM_VS_TEAM",
					"TEAM_VS_TEAM_SEASON",
					"YES_NO_PROP",
					"PLAYER_AWARD_FINALISTS",
					() => (
						<VStack gap="1.5" alignItems="stretch">
							<span className={valueClass}>
								{winner
									? headToHeadScore
										? `${winner.label}, ${headToHeadScore}`
										: winner.label
									: "-"}
							</span>
							<span className={subClass}>{winnerSub}</span>
						</VStack>
					),
				)
				.with(
					"PLAYER_SEASON_AWARD",
					"TEAM_SEASON_AWARD",
					"PLAYER_GAME_STAT_LEADER",
					"PLAYER_SEASON_STAT_LEADER",
					() => (
						<VStack gap="1.5" alignItems="stretch">
							<VStack gap="0" alignItems="stretch">
								{winners.map((option) => (
									<HStack
										key={option.id}
										gap="2"
										alignItems="center"
										paddingBlock="0.5"
									>
										<span
											className={css({
												width: "1",
												height: "1",
												borderRadius: "full",
												backgroundColor: "fg.subtle",
												flexShrink: "0",
											})}
										/>
										<span
											className={css({
												fontSize: "md",
												fontWeight: "bold",
												color: "fg.default",
											})}
										>
											{option.actualValue !== null
												? `${option.label}, ${formatGuess(option.actualValue, isRateStat)}`
												: option.label}
										</span>
									</HStack>
								))}
							</VStack>
							<span className={subClass}>{callers}</span>
						</VStack>
					),
				)
				.exhaustive()}
		</VStack>
	)
}
