import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { useTourAnchor } from "#/components/onboarding/tour-anchors"
import type { EntitySearchItem } from "#/components/questions/create-question/entity-search-field"
import { EntitySearchField } from "#/components/questions/create-question/entity-search-field"
import { FieldLabel } from "#/components/ui/field-label"
import { optionDisplayLabel } from "#/lib/question-labels"
import { CaseField } from "./case-field"
import { ConvictionCard } from "./conviction-card"
import { OPTIONS_PAGE_STEP, OptionPickerList } from "./option-picker-list"
import { type CastCallFormState, isOverUnderShape } from "./use-cast-call-form"

type Props = {
	callForm: CastCallFormState
}

// Every single-pick shape (the seven that resolve to bucket "single" - see
// castCallBucketFor) - exactly one pick from a fixed row list.
export function OptionFields({ callForm }: Props) {
	const { question, shape, selections, selectSingle, isRateStat } = callForm

	const [optionSearch, setOptionSearch] = useState("")

	// No-ops unless a first-call walkthrough is running above this form.
	const picksAnchor = useTourAnchor("picks")

	if (!question) return null

	return (
		<VStack gap="5" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch" ref={picksAnchor}>
				<FieldLabel required>Make your call</FieldLabel>
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
				/>
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
			<ConvictionCard callForm={callForm} />
			<CaseField callForm={callForm} />
		</VStack>
	)
}
