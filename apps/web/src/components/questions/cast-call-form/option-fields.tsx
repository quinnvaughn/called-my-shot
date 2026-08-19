import { BASE_POINTS_BY_TYPE } from "@called-my-shot/scoring"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { EntitySearchItem } from "#/components/questions/create-question/entity-search-field"
import { EntitySearchField } from "#/components/questions/create-question/entity-search-field"
import { Card } from "#/components/ui/card"
import { FieldLabel } from "#/components/ui/field-label"
import { Slider } from "#/components/ui/slider"
import { OptionRow } from "../option-row"
import { PointsPreview } from "../points-preview"
import { CaseField } from "./case-field"
import {
	OPTIONS_PAGE_STEP,
	optionDisplayLabel,
	OptionPickerList,
} from "./option-picker-list"
import type { CastCallFormState } from "./use-cast-call-form"

type Props = {
	callForm: CastCallFormState
}

// multiple_choice / yes_no / over_under - exactly one pick from a row list,
// plus (multiple_choice on an optionsOpenField question only) search against
// the real league catalog instead of the question's own possibly-empty pool.
export function OptionFields({ callForm }: Props) {
	const {
		question,
		type,
		form,
		selections,
		newOption,
		singleSelectConviction,
		setSingleSelectConviction,
		selectSingle,
		isOpenField,
		openFieldSearch,
		setOpenFieldSearch,
		openFieldCatalogItems,
		selectNewOption,
	} = callForm

	const [optionSearch, setOptionSearch] = useState("")

	if (!question) return null

	// null = nothing picked yet. A newOption pick has no fieldPct of its own
	// (nobody's called it yet either), so it previews at 0 - same as any
	// other option nobody else has picked.
	const selectedFieldPct = newOption
		? 0
		: selections[0]
			? (question.options.find((o) => o.id === selections[0].optionId)
					?.fieldPct ?? 0)
			: null

	return (
		<VStack gap="5" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch">
				<FieldLabel required>Make your call</FieldLabel>
				<OptionPickerList
					options={question.options}
					type={type}
					ouLine={question.ouLine}
					callCount={question.callCount}
					isSelected={(optionId) =>
						selections.some((s) => s.optionId === optionId)
					}
					onSelect={selectSingle}
					extraRow={
						newOption && (
							<OptionRow
								label={`${newOption.label} — new pick`}
								fieldPct={null}
								selected
								onClick={() => {}}
							/>
						)
					}
				/>
			</VStack>
			{!isOpenField && question.options.length > OPTIONS_PAGE_STEP && (
				<EntitySearchField
					value={optionSearch}
					onValueChange={setOptionSearch}
					items={question.options.map(
						(option): EntitySearchItem => ({
							id: option.id,
							label: optionDisplayLabel(option, type, question.ouLine),
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
			{isOpenField && (
				<EntitySearchField
					value={openFieldSearch}
					onValueChange={setOpenFieldSearch}
					items={openFieldCatalogItems}
					placeholder={
						question.openFieldKind === "TEAM"
							? "Search any team to make your call…"
							: "Search any player to make your call…"
					}
					clearOnSelect
					onSelectItem={(item) => {
						const existing = question.options.find(
							(option) =>
								option.team?.id === item.id || option.player?.id === item.id,
						)
						if (existing) selectSingle(existing.id)
						else selectNewOption(item)
					}}
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
									if (newOption) {
										form.setValue("newOption", { ...newOption, conviction: v })
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
							basePoints={BASE_POINTS_BY_TYPE[type]}
						/>
					</VStack>
				</Card.Body>
			</Card>
			<CaseField callForm={callForm} />
		</VStack>
	)
}
