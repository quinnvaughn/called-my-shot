import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import type { CastCallFormState } from "#/components/questions/cast-call-form"
import { isOverUnderShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import { callersText, formatGuess } from "#/lib/field-signal"
import { optionDisplayLabel } from "#/lib/question-labels"
import {
	basePointsForGql,
	DEFAULT_CONVICTION,
	optionPointsPreview,
	previewNumericPoints,
} from "#/lib/scoring"

// The call as it stands, on the line above Lock It In: the pick, its
// conviction, and what it pays or costs. Single-pick and numeric calls only,
// since those lock in straight from the bar with no review step in between.
// Before anything is picked, the field's size instead.
export function CallSubmitSummary({
	callForm,
}: {
	callForm: CastCallFormState
}) {
	const {
		question,
		shape,
		bucket,
		form,
		selections,
		singleSelectConviction,
		isRateStat,
	} = callForm
	const guessValue = form.useWatch("guessValue")
	const numericConviction = form.useWatch("conviction")

	if (!question) return null

	const summary = (() => {
		if (bucket === "numeric") {
			if (guessValue === undefined) return null
			const conviction = numericConviction ?? DEFAULT_CONVICTION
			const payout = previewNumericPoints(
				basePointsForGql(question.shape, question.isOfficial, question.isPriced) *
					(question.viewerSeasonPlay?.weight ?? 1) *
					(question.seriesStage?.weight ?? 1),
				question.lossRate,
				conviction,
			)
			return {
				pick: formatGuess(guessValue, isRateStat),
				conviction,
				win:
					payout.winLow === payout.winHigh
						? `+${payout.winLow}`
						: `+${payout.winLow}–${payout.winHigh}`,
				lose: `−${payout.lose}`,
			}
		}
		const option = question.options.find(
			(o) => o.id === selections[0]?.optionId,
		)
		if (!option) return null
		const payout = optionPointsPreview(
			question,
			option,
			question.options.length,
			singleSelectConviction,
		)
		return {
			pick: optionDisplayLabel(
				option.label,
				isOverUnderShape(shape),
				question.ouLine,
				isRateStat,
			),
			conviction: singleSelectConviction,
			win: `+${payout.win}`,
			lose: `−${payout.lose}`,
		}
	})()

	if (!summary) {
		return (
			<HStack
				justify="space-between"
				className={css({ textStyle: "metaLg", color: "fg.muted" })}
			>
				<span>{callersText(question.callCount)}</span>
				<span>bold picks reward more points</span>
			</HStack>
		)
	}

	return (
		<HStack justify="space-between" gap="3" className={css({ minWidth: 0 })}>
			<span
				className={css({
					fontSize: "sm",
					color: "fg.muted",
					minWidth: 0,
					truncate: true,
				})}
			>
				<span className={css({ fontWeight: "bold", color: "fg.default" })}>
					{summary.pick}
				</span>
				{` · ${summary.conviction}% conviction`}
			</span>
			<span
				className={css({
					flexShrink: "0",
					textStyle: "metaLg",
					whiteSpace: "nowrap",
				})}
			>
				<span className={css({ color: "success.default", fontWeight: "bold" })}>
					{summary.win}
				</span>
				<span className={css({ color: "fg.subtle" })}> / </span>
				<span className={css({ color: "danger.default", fontWeight: "bold" })}>
					{summary.lose}
				</span>
			</span>
		</HStack>
	)
}
