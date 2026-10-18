import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { useTourAnchor } from "#/components/onboarding/tour-anchors"
import type { EntitySearchItem } from "#/components/questions/create-question/entity-search-field"
import { EntitySearchField } from "#/components/questions/create-question/entity-search-field"
import { FieldLabel } from "#/components/ui/field-label"
import { optionDisplayLabel } from "#/lib/question-labels"
import { optionPointsPreview } from "#/lib/scoring"
import { CaseField } from "./case-field"
import { useCastCallFormContext } from "./cast-call-form-context"
import { ConvictionRow } from "./conviction-row"
import { OPTIONS_PAGE_STEP, OptionPickerList } from "./option-picker-list"
import { isOverUnderShape } from "./use-cast-call-form"

// Every single-pick shape (the seven that resolve to bucket "single" - see
// castCallBucketFor) - exactly one pick from a fixed row list.
export function OptionFields() {
	const {
		question,
		shape,
		selections,
		selectSingle,
		isRateStat,
		singleSelectConviction,
		optionPages,
		showMoreOptions,
	} = useCastCallFormContext()

	const [optionSearch, setOptionSearch] = useState("")

	// No-ops unless a first-call walkthrough is running above this form. The
	// points step points at the rows too, since that's where the points are.
	const picksAnchor = useTourAnchor("picks")
	const payoutAnchor = useTourAnchor("payout")

	if (!question) return null

	return (
		<VStack gap="4" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch" ref={picksAnchor}>
				<FieldLabel>Make your call</FieldLabel>
				<div ref={payoutAnchor}>
				<OptionPickerList
					options={question.options}
					shape={shape}
					ouLine={question.ouLine}
					isRateStat={isRateStat}
					callCount={question.callCount}
					isSelected={(optionId) =>
						selections.some((s) => s.optionId === optionId)
					}
					onSelect={selectSingle}
					pointsFor={(optionId) => {
						const option = question.options.find((o) => o.id === optionId)
						return option
							? optionPointsPreview(
									question,
									option,
									question.options.length,
									singleSelectConviction,
								)
							: { win: 0, lose: 0 }
					}}
					pointsConviction={singleSelectConviction}
					pages={optionPages}
					onShowMore={showMoreOptions}
					showFieldLine={false}
				/>
				</div>
			</VStack>
			{question.options.length > OPTIONS_PAGE_STEP && (
				<EntitySearchField
					value={optionSearch}
					onValueChange={setOptionSearch}
					items={question.options.map(
						(option): EntitySearchItem => ({
							id: option.id,
							label: optionDisplayLabel(
								option.label,
								isOverUnderShape(shape),
								question.ouLine,
								isRateStat,
							),
							kind: "team",
							image: { player: option.player, team: option.team },
							meta:
								option.fieldPct !== null
									? `${Math.round(option.fieldPct)}%`
									: undefined,
						}),
					)}
					placeholder="Search…"
					clearOnSelect
					onSelectItem={(item) => selectSingle(item.id)}
				/>
			)}
			<ConvictionRow />
			<CaseField />
		</VStack>
	)
}
