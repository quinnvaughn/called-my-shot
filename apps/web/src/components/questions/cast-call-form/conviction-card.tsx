import {
	basePointsFor,
	effectiveLossRate,
	isSeasonLongShape,
	seasonEarlyTierFor,
} from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { useTourAnchor } from "#/components/onboarding/tour-anchors"
import { Card } from "#/components/ui/card"
import { FieldLabel } from "#/components/ui/field-label"
import { Slider } from "#/components/ui/slider"
import { previewFieldPct } from "#/lib/scoring"
import { PointsPreview } from "../points-preview"
import type { CastCallFormState } from "./use-cast-call-form"

// Conviction on a single-pick call, with the payout it produces right under
// the slider. Shared by the call form and the fade modal, which fixes the pick
// but leaves conviction to the fader.
export function ConvictionCard({ callForm }: { callForm: CastCallFormState }) {
	const {
		question,
		shape,
		form,
		selections,
		singleSelectConviction,
		setSingleSelectConviction,
	} = callForm

	// No-ops unless a first-call walkthrough is running above this card.
	const convictionAnchor = useTourAnchor("conviction")
	const payoutAnchor = useTourAnchor("payout")

	if (!question) return null

	const selectedOption = selections[0]
		? question.options.find((o) => o.id === selections[0].optionId)
		: undefined
	// null = nothing picked yet. Simulated as if this call already went
	// through (see previewFieldPct) so the number shown here matches what
	// fieldPct will actually read the instant after submitting, rather than
	// a before-me snapshot that jumps once the real call is counted.
	const selectedFieldPct = selections[0]
		? previewFieldPct(selectedOption?.callCount ?? 0, question.callCount)
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

	// The conviction step highlights this whole card, slider and payout
	// preview together, rather than just the slider: the point of that step
	// is that dragging conviction moves the numbers, which is unreadable if
	// the numbers are outside the highlight.
	return (
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
								basePoints={basePointsFor({ shape, isOfficial: question.isOfficial })}
								lossRate={effectiveLossRate(
									question.lossRate,
									selectedOption?.lossRate,
								)}
								earlyTier={earlyTier}
								pricing={selectedOption}
							/>
						</div>
					</VStack>
				</Card.Body>
			</Card>
		</div>
	)
}
