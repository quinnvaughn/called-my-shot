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
import { previewCrowdPct } from "#/lib/scoring"
import { PointsPreview } from "../points-preview"
import { SeasonPlayNote } from "../season-play-note"
import { SeriesStageNote } from "../series-stage-note"
import { useCastCallFormContext } from "./cast-call-form-context"

// Conviction on a single-pick call, with the payout it produces right under
// the slider.
export function ConvictionCard() {
	const {
		question,
		shape,
		form,
		selections,
		singleSelectConviction,
		setSingleSelectConviction,
	} = useCastCallFormContext()

	// No-ops unless a first-call walkthrough is running above this card.
	const convictionAnchor = useTourAnchor("conviction")
	const payoutAnchor = useTourAnchor("payout")

	if (!question) return null

	const selectedOption = selections[0]
		? question.options.find((o) => o.id === selections[0].optionId)
		: undefined
	// null = nothing picked yet. Simulated as if this call already went
	// through (see previewCrowdPct) so the number shown here matches what
	// the field's share will actually read the instant after submitting,
	// rather than a before-me snapshot that jumps once the real call is
	// counted.
	const selectedCrowdPct = selections[0]
		? previewCrowdPct(
				selectedOption?.convictionTotal ?? 0,
				question.fieldConviction,
				singleSelectConviction,
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
								<span className={css({ textStyle: "metaLg" })}>
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
								crowdPct={selectedCrowdPct}
								totalOptions={question.options.length}
								conviction={singleSelectConviction}
								basePoints={
									basePointsFor({
										shape,
										isOfficial: question.isOfficial,
										isPriced: question.isPriced,
									}) *
									(question.viewerSeasonPlay?.weight ?? 1) *
									(question.seriesStage?.weight ?? 1)
								}
								lossRate={effectiveLossRate(
									question.lossRate,
									selectedOption?.lossRate,
								)}
								earlyTier={earlyTier}
								pricing={selectedOption}
							/>
							{question.viewerSeasonPlay && (
								<div className={css({ marginTop: "2" })}>
									<SeasonPlayNote
										play={question.viewerSeasonPlay}
										league={question.league.abbreviation}
									/>
								</div>
							)}
							{question.seriesStage && (
								<div className={css({ marginTop: "2" })}>
									<SeriesStageNote stage={question.seriesStage} />
								</div>
							)}
						</div>
					</VStack>
				</Card.Body>
			</Card>
		</div>
	)
}
