import { BASE_POINTS_BY_SHAPE } from "@called-my-shot/scoring"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { EntitySearchItem } from "#/components/questions/create-question/entity-search-field"
import { EntitySearchField } from "#/components/questions/create-question/entity-search-field"
import { Card } from "#/components/ui/card"
import { FieldLabel } from "#/components/ui/field-label"
import { Slider } from "#/components/ui/slider"
import { optionDisplayLabel } from "#/lib/question-labels"
import { previewFieldPct } from "#/lib/scoring"
import { PointsPreview } from "../points-preview"
import { CaseField } from "./case-field"
import { OPTIONS_PAGE_STEP, OptionPickerList } from "./option-picker-list"
import { type CastCallFormState, isOverUnderShape } from "./use-cast-call-form"

type Props = {
	callForm: CastCallFormState
}

// Every single-pick shape (the seven that resolve to bucket "single" - see
// castCallBucketFor) - exactly one pick from a fixed row list.
export function OptionFields({ callForm }: Props) {
	const {
		question,
		shape,
		form,
		selections,
		singleSelectConviction,
		setSingleSelectConviction,
		selectSingle,
		isRateStat,
	} = callForm

	const [optionSearch, setOptionSearch] = useState("")

	if (!question) return null

	// null = nothing picked yet. Simulated as if this call already went
	// through (see previewFieldPct) so the number shown here matches what
	// fieldPct will actually read the instant after submitting, rather than
	// a before-me snapshot that jumps once the real call is counted.
	const selectedFieldPct = selections[0]
		? previewFieldPct(
				question.options.find((o) => o.id === selections[0].optionId)
					?.callCount ?? 0,
				question.callCount,
			)
		: null

	return (
		<VStack gap="5" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch">
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
			<Card>
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<VStack gap="1.5" alignItems="stretch">
							<HStack justify="space-between">
								<FieldLabel>Conviction</FieldLabel>
								<span className={css({ fontFamily: "mono", fontSize: "xs" })}>
									{singleSelectConviction}%
								</span>
							</HStack>
							<Slider
								value={singleSelectConviction}
								onChange={(v) => {
									setSingleSelectConviction(v)
									if (selections[0]) {
										form.setValue("selections.0.conviction", v)
									}
								}}
								aria-label="Conviction"
							/>
						</VStack>
						<PointsPreview
							kind="option"
							fieldPct={selectedFieldPct}
							totalOptions={question.options.length}
							conviction={singleSelectConviction}
							basePoints={BASE_POINTS_BY_SHAPE[shape]}
						/>
					</VStack>
				</Card.Body>
			</Card>
			<CaseField callForm={callForm} />
		</VStack>
	)
}
