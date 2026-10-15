import { VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import {
	CastCallForm,
	type useCastCallForm,
} from "#/components/questions/cast-call-form"
import { FieldBreakdownCard } from "#/components/questions/field-breakdown-card"
import { GuessDistributionChart } from "#/components/questions/guess-distribution-chart"
import { OptionFieldBreakdown } from "#/components/questions/option-field-breakdown"
import { StreakStakeLine } from "#/components/questions/streak-stake-line"
import { isNumericQuestionShape } from "#/lib/question-labels"
import type { QuestionDetail, QuestionDetailStatus } from "./types"

// While the call is still open, the picker itself (CastCallForm)
// shows this same live breakdown inline - one card for "make your
// call" and "how the field's calling it", not two on the same page.
// Once there's nothing left to pick (called, locked, resolved), it
// needs a card of its own again - always after the status card above
// (your call/outcome vs. how the whole field called it are two
// different concepts, but the order between them never flips
// regardless of which status - pending, won, either loss - is active).
export function QuestionPickSection({
	question,
	status,
	callForm,
	showForm,
}: {
	question: QuestionDetail
	status: QuestionDetailStatus
	callForm: ReturnType<typeof useCastCallForm>
	showForm: boolean
}) {
	// Which option row(s) read as "active" in the breakdown below: your own
	// pick if you called (mirrors numeric's own myGuess highlight - it's your
	// call being pointed at, not necessarily the right one), or the winning
	// option(s) instead once resolved if you never called (nothing else on
	// the row list is meaningful to a spectator on a settled question).
	// Neither once locked-but-not-yet-resolved with no call of your own.
	const breakdownHighlightIds = match(status)
		.returnType<string[]>()
		.with({ kind: P.union("pending", "resolved") }, ({ call }) =>
			call.selections.map((selection) => selection.option.id),
		)
		.with({ kind: "resolvedNoCall" }, () =>
			question.options
				.filter((option) => option.isCorrect)
				.map((option) => option.id),
		)
		.with({ kind: P.union("canCall", "lockedNoCall") }, () => [])
		.with({ kind: "voided" }, ({ call }) =>
			call ? call.selections.map((selection) => selection.option.id) : [],
		)
		.exhaustive()

	return showForm ? (
		<VStack gap="3" alignItems="stretch">
			{question.viewerStreak && (
				<StreakStakeLine
					leagueAbbr={question.league.abbreviation}
					stake={question.viewerStreak}
				/>
			)}
			<CastCallForm callForm={callForm} />
		</VStack>
	) : (
		<FieldBreakdownCard>
			{isNumericQuestionShape(question.shape) ? (
				<GuessDistributionChart
					buckets={question.guessDistribution}
					averageGuess={question.averageGuess}
					myGuess={question.viewerCall?.guessValue ?? null}
					tone="record"
					isRateStat={callForm.isRateStat}
				/>
			) : (
				<OptionFieldBreakdown
					options={question.options}
					shape={question.shape}
					ouLine={question.ouLine}
					isRateStat={callForm.isRateStat}
					callCount={question.callCount}
					highlightedOptionIds={breakdownHighlightIds}
				/>
			)}
		</FieldBreakdownCard>
	)
}
