import {
	BASE_POINTS_BY_SHAPE,
	isSeasonLongShape,
	seasonEarlyTierFor,
} from "@called-my-shot/scoring"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { useTourAnchor } from "#/components/onboarding/tour-anchors"
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

	// No-ops unless a first-call walkthrough is running above this form.
	const picksAnchor = useTourAnchor("picks")
	const convictionAnchor = useTourAnchor("conviction")
	const payoutAnchor = useTourAnchor("payout")

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

	// Season-long shapes preview off games played so far, not rank - see
	// PointsPreview's own comment. question.seasonGamesPlayed/seasonTotalGames
	// are only ever null for a game-scoped shape (or a season-long one with no
	// games synced yet, where seasonEarlyTierFor's own zero-games guard lands
	// on the same preseason ceiling), so leaving earlyTier undefined there is
	// correct either way.
	const earlyTier =
		isSeasonLongShape(shape) &&
		question.seasonGamesPlayed !== null &&
		question.seasonTotalGames !== null
			? seasonEarlyTierFor(
					question.seasonGamesPlayed,
					question.seasonTotalGames,
				)
			: undefined

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
			{/* The conviction step highlights this whole card, slider and payout
			    preview together, rather than just the slider: the point of that
			    step is that dragging conviction moves the numbers, which is
			    unreadable if the numbers are outside the highlight. */}
			<div ref={convictionAnchor}>
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
							<div ref={payoutAnchor}>
								<PointsPreview
									kind="option"
									fieldPct={selectedFieldPct}
									totalOptions={question.options.length}
									conviction={singleSelectConviction}
									basePoints={BASE_POINTS_BY_SHAPE[shape]}
									earlyTier={earlyTier}
								/>
							</div>
						</VStack>
					</Card.Body>
				</Card>
			</div>
			<CaseField callForm={callForm} />
		</VStack>
	)
}
