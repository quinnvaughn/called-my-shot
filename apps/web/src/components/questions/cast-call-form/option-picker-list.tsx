import { useState } from "react"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { callersText } from "#/lib/field-signal"
import { OptionRow } from "../option-row"
import type { QuestionCallType } from "./use-cast-call-form"

// Shared by the visible option rows and the search dropdown below them, so
// the O/U line suffix can't drift between the two renderings of the same
// option.
export function optionDisplayLabel(
	option: { label: string },
	type: QuestionCallType,
	ouLine: number | null,
): string {
	return type === "over_under" && ouLine !== null
		? `${option.label} ${ouLine}`
		: option.label
}

// Options paginate 5 at a time rather than dumping the whole pool (a
// championship field runs to 30 rows) - same step the field breakdown card
// (see OptionFieldBreakdown) pages through elsewhere.
export const OPTIONS_PAGE_STEP = 5

type PickerOption = {
	id: string
	label: string
	fieldPct: number | null
	callCount: number
}

type Props = {
	options: PickerOption[]
	type: QuestionCallType
	ouLine: number | null
	callCount: number
	isSelected: (optionId: string) => boolean
	onSelect: (optionId: string) => void
	// The single-select picker's in-progress "new option" pick (open-field
	// only) has no id in `options` yet, so it can't be one of these rows -
	// rendered after them instead, before "show more" and the count.
	extraRow?: ReactNode
}

// The picker half of "how the field's calling it" - single-select
// (OptionFields: multiple_choice/yes_no/over_under, exactly one pick) and
// multi-select (MultiSelectFields, several picks) show the exact same rows
// paginated the exact same way, differing only in what a click on a row
// does and how many rows can be selected at once. That difference is the
// caller's to own (isSelected/onSelect), not this component's.
export function OptionPickerList({
	options,
	type,
	ouLine,
	callCount,
	isSelected,
	onSelect,
	extraRow,
}: Props) {
	const [visibleOptionCount, setVisibleOptionCount] =
		useState(OPTIONS_PAGE_STEP)

	return (
		<VStack gap="2.5" alignItems="stretch">
			<VStack gap="2.5" alignItems="stretch">
				{options.slice(0, visibleOptionCount).map((option) => (
					<OptionRow
						key={option.id}
						label={optionDisplayLabel(option, type, ouLine)}
						fieldPct={option.fieldPct}
						count={option.callCount}
						selected={isSelected(option.id)}
						onClick={() => onSelect(option.id)}
					/>
				))}
				{extraRow}
			</VStack>
			{visibleOptionCount < options.length && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					fullWidth
					onClick={() => setVisibleOptionCount((v) => v + OPTIONS_PAGE_STEP)}
				>
					Show{" "}
					{Math.min(OPTIONS_PAGE_STEP, options.length - visibleOptionCount)}{" "}
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
