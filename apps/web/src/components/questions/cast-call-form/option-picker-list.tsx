import type { ReactNode } from "react"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import {
	type ImagePlayer,
	type ImageTeam,
	PlayerOrTeamImage,
} from "#/components/ui/player-or-team-image"
import { callersText } from "#/lib/field-signal"
import { optionDisplayLabel } from "#/lib/question-labels"
import { OptionRow } from "../option-row"
import {
	isAwardShape,
	isOverUnderShape,
	type QuestionCallShape,
} from "./use-cast-call-form"

// Options paginate 5 at a time rather than dumping the whole pool (a
// championship field runs to 30 rows) - same step the field breakdown card
// (see OptionFieldBreakdown) pages through elsewhere.
export const OPTIONS_PAGE_STEP = 5

// The first `visibleCount` rows plus any pinned row past them (the viewer's
// own pick), each in its ranked position. A pick picked through search from
// row 12 still shows as selected instead of hiding behind "Show more".
// `nextCount` is how many rows the next page actually adds, since a pinned
// row inside that page is already on screen.
export function pageOptions<T extends { id: string }>(
	options: T[],
	visibleCount: number,
	isPinned: (optionId: string) => boolean,
) {
	const pageOf = (count: number) =>
		options.filter((option, index) => index < count || isPinned(option.id))
	const visible = pageOf(visibleCount)
	const nextCount =
		pageOf(visibleCount + OPTIONS_PAGE_STEP).length - visible.length
	return { visible, nextCount }
}

type PickerOption = {
	id: string
	label: string
	fieldPct: number | null
	callCount: number
	// The model's chance this option hits, on a priced one.
	modelHitRate?: number | null
	// Set when the option is a real player or team, for its image.
	player?: ImagePlayer | null
	team?: ImageTeam | null
}

type Props = {
	options: PickerOption[]
	shape: QuestionCallShape
	ouLine: number | null
	// True only for a rate stat - see optionDisplayLabel above.
	isRateStat?: boolean
	callCount: number
	isSelected: (optionId: string) => boolean
	onSelect: (optionId: string) => void
	extraRow?: ReactNode
	// Each row's win and miss at `pointsConviction`, so every side can be
	// compared before one is picked. Omitted, rows show no points.
	pointsFor?: (optionId: string) => { win: number; lose: number }
	pointsConviction?: number
}

// The picker half of "how the field's calling it" - single-pick
// (OptionFields, exactly one pick across 7 different shapes) and multi-pick
// (MultiSelectFields, several picks) show the exact same rows paginated the
// exact same way, differing only in what a click on a row does and how many
// rows can be selected at once. That difference is the caller's to own
// (isSelected/onSelect), not this component's.
export function OptionPickerList({
	options,
	shape,
	ouLine,
	isRateStat = false,
	callCount,
	isSelected,
	onSelect,
	extraRow,
	pointsFor,
	pointsConviction,
}: Props) {
	const [visibleOptionCount, setVisibleOptionCount] =
		useState(OPTIONS_PAGE_STEP)

	// Award shapes default to popularity (highest fieldPct first) instead of
	// the API's sortOrder, so the obvious picks surface before anyone's made
	// one - see isAwardShape. Sort is stable, so untouched options (fieldPct
	// tied, usually 0 early on) keep falling back to sortOrder rather than
	// jumping around arbitrarily.
	// A priced pool (a game stat leader) goes by the model's chance
	// instead, ahead of popularity: the favorites first, the long shots a
	// search or a few pages down, before anyone has called it. Any option
	// someone has called still shows on the first page, in its place by
	// chance, so a long shot people took isn't buried behind the favorites.
	const isPriced = options.some((option) => option.modelHitRate != null)
	const orderedOptions = isPriced
		? [...options].sort(
				(a, b) => (b.modelHitRate ?? -1) - (a.modelHitRate ?? -1),
			)
		: isAwardShape(shape)
			? [...options].sort((a, b) => (b.fieldPct ?? 0) - (a.fieldPct ?? 0))
			: options
	const calledIds = new Set(
		isPriced
			? options
					.filter((option) => option.callCount > 0)
					.map((option) => option.id)
			: [],
	)
	const { visible, nextCount } = pageOptions(
		orderedOptions,
		visibleOptionCount,
		(optionId) => isSelected(optionId) || calledIds.has(optionId),
	)

	return (
		<VStack gap="2.5" alignItems="stretch">
			<VStack gap="2.5" alignItems="stretch">
				{visible.map((option) => (
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
						fieldPct={option.fieldPct}
						count={option.callCount}
						selected={isSelected(option.id)}
						onClick={() => onSelect(option.id)}
						points={pointsFor?.(option.id)}
					/>
				))}
				{extraRow}
			</VStack>
			{nextCount > 0 && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					fullWidth
					onClick={() => setVisibleOptionCount((v) => v + OPTIONS_PAGE_STEP)}
				>
					Show {nextCount} more
				</Button>
			)}
			<span
				className={css({
					textStyle: "labelSm",
					color: "fg.subtle",
					textAlign: "center",
				})}
			>
				{callersText(callCount)}
				{pointsFor &&
					pointsConviction !== undefined &&
					` · points at ${pointsConviction}% conviction`}
			</span>
		</VStack>
	)
}
