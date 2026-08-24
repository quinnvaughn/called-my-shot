import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { callersText } from "#/lib/field-signal"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"
import { OPTIONS_PAGE_STEP } from "./cast-call-form/option-picker-list"
import { OptionRow } from "./option-row"

type Option = {
	id: string
	label: string
	fieldPct: number | null
	callCount: number
}

type Props = {
	options: Option[]
	shape: QuestionShape
	ouLine: number | null
	// True only for a rate stat - see optionDisplayLabel in
	// #/lib/question-labels.
	isRateStat?: boolean
	// The question's own total, not a sum of the option rows above - a
	// player_season_award/team_season_award caller shows up under several
	// rows at once, so summing row counts would overcount them. Same number
	// CallSubmitBar shows while
	// the call is still open, repeated here once it's gone (this card is what
	// replaces the picker on the page, not something shown alongside it).
	callCount: number
	// Which rows read as "active" - the viewer's own pick(s) if they called,
	// or the winning option(s) instead once resolved if they didn't (there's
	// nothing else meaningful to point at for a spectator on a settled
	// question). Computed by the caller, not here - deciding between those
	// two is a question-detail-page concern, not this list's.
	highlightedOptionIds: string[]
}

// Same OptionRow the live picker uses, minus onClick (nothing left to pick)
// and search (the mockup this was built from only ever offers search on the
// interactive picker, never on a read-only breakdown), paginated the same
// PAGE_STEP at a time - a championship field runs to 30 rows same as the
// picker does.
//
// Ordered by callCount here, not the incoming sortOrder order the picker
// uses - "how the field called it" reads as a result, so it should rank
// most-called first, the same way a leaderboard would. The picker keeps the
// stable authored order instead (see option-fields.tsx) since reshuffling
// rows under someone mid-browse as votes change would be actively unhelpful
// there. A tie (including 0-0) falls back to that same stable order rather
// than jumping around - Array#sort is stable, and `options` already arrives
// sorted that way.
//
// Zero-call rows are dropped entirely, not just sorted to the bottom - this
// is "how the field called it," and the field didn't call those at all,
// there's nothing to report. The picker (option-fields.tsx) is the opposite
// case on purpose: while you're still choosing, every option has to stay
// visible whether anyone else has picked it yet or not. The one exception
// is a highlighted row (your own pick, or the winner once resolved) - that
// always stays even at 0, since a pick or a winner silently vanishing from
// its own breakdown would read as broken, not as "nobody called it."
export function OptionFieldBreakdown({
	options,
	shape,
	ouLine,
	isRateStat = false,
	callCount,
	highlightedOptionIds,
}: Props) {
	const [visibleCount, setVisibleCount] = useState(OPTIONS_PAGE_STEP)
	const rankedOptions = options
		.filter(
			(option) => option.callCount > 0 || highlightedOptionIds.includes(option.id),
		)
		.sort((a, b) => b.callCount - a.callCount)

	return (
		<VStack gap="2.5" alignItems="stretch">
			{rankedOptions.length === 0 && (
				<span
					className={css({
						fontSize: "sm",
						color: "fg.muted",
						textAlign: "center",
						paddingBlock: "2",
					})}
				>
					No one's called this yet.
				</span>
			)}
			{rankedOptions.slice(0, visibleCount).map((option) => (
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
					selected={highlightedOptionIds.includes(option.id)}
				/>
			))}
			{visibleCount < rankedOptions.length && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					fullWidth
					onClick={() => setVisibleCount((v) => v + OPTIONS_PAGE_STEP)}
				>
					Show {Math.min(OPTIONS_PAGE_STEP, rankedOptions.length - visibleCount)}{" "}
					more
				</Button>
			)}
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					textTransform: "uppercase",
					textAlign: "center",
				})}
			>
				{callersText(callCount)}
			</span>
		</VStack>
	)
}
