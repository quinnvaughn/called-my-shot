import {
	basePointsFor,
	effectiveLossRate,
	isSeasonLongShape,
	seasonEarlyTierFor,
} from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { useTourAnchor } from "#/components/onboarding/tour-anchors"
import { FieldLabel } from "#/components/ui/field-label"
import { Slider } from "#/components/ui/slider"
import {
	formatMult,
	previewCrowdPct,
	previewSelectionPoints,
} from "#/lib/scoring"
import { SeasonPlayNote } from "../season-play-note"
import { SeriesStageNote } from "../series-stage-note"
import { useCastCallFormContext } from "./cast-call-form-context"

const metaClass = css({ textStyle: "metaSm", color: "fg.subtle" })

// Conviction on a single-pick call: label, slider and value on one line. The
// points it produces are on the option rows above, which move with it, so
// this only adds what those numbers can't say on their own: a boldness or
// early bonus the picked side is getting, and how a season or series call's
// points are scaled.
export function ConvictionRow() {
	const {
		question,
		shape,
		form,
		selections,
		singleSelectConviction,
		setSingleSelectConviction,
	} = useCastCallFormContext()

	// No-op unless a first-call walkthrough is running above this row.
	const convictionAnchor = useTourAnchor("conviction")

	if (!question) return null

	const selectedOption = selections[0]
		? question.options.find((o) => o.id === selections[0].optionId)
		: undefined
	// Season-long shapes preview off games played so far, not rank - see
	// PointsPreview's own comment. Undefined for a game-scoped shape.
	const earlyTier =
		isSeasonLongShape(shape) &&
		question.seasonGamesPlayed !== null &&
		question.seasonTotalGames !== null
			? seasonEarlyTierFor(
					question.seasonGamesPlayed,
					question.seasonTotalGames,
				)
			: undefined
	// Simulated as if this call already went through (see previewCrowdPct),
	// so the bonus named here is the one the call will actually get.
	const preview = selectedOption
		? previewSelectionPoints(
				basePointsFor({
					shape,
					isOfficial: question.isOfficial,
					isPriced: question.isPriced,
				}) *
					(question.viewerSeasonPlay?.weight ?? 1) *
					(question.seriesStage?.weight ?? 1),
				effectiveLossRate(question.lossRate, selectedOption.lossRate),
				previewCrowdPct(
					selectedOption.convictionTotal,
					question.fieldConviction,
					singleSelectConviction,
				),
				question.options.length,
				singleSelectConviction,
				earlyTier,
				selectedOption,
			)
		: null
	const bonuses = preview
		? [
				...(preview.tier
					? [`×${formatMult(preview.tier.mult)} boldness`]
					: []),
				...(preview.earlyTier.mult > 1
					? [`×${formatMult(preview.earlyTier.mult)} early`]
					: []),
			]
		: []

	return (
		<VStack gap="1.5" alignItems="stretch" ref={convictionAnchor}>
			{/* One line from md up. On a phone the label and value share a line
			    and the slider gets the full width under them, since a slider
			    squeezed between the two is too short to set with a thumb. */}
			<div
				className={css({
					display: "grid",
					alignItems: "center",
					columnGap: "3",
					gridTemplateColumns: { base: "1fr auto", md: "auto 1fr auto" },
					gridTemplateAreas: {
						base: '"label value" "slider slider"',
						md: '"label slider value"',
					},
				})}
			>
				<FieldLabel className={css({ gridArea: "label" })}>
					Conviction
				</FieldLabel>
				<Slider
					value={singleSelectConviction}
					onChange={(v) => {
						setSingleSelectConviction(v)
						if (selections[0]) {
							form.setValue("selections.0.conviction", v)
						}
					}}
					aria-label="Conviction"
					className={css({ gridArea: "slider" })}
				/>
				<span
					className={css({
						gridArea: "value",
						textStyle: "metaLg",
						minWidth: "10",
						textAlign: "right",
					})}
				>
					{singleSelectConviction}%
				</span>
			</div>
			{bonuses.length > 0 && (
				<span className={metaClass}>
					{bonuses.join(" · ")} bonus on this side
				</span>
			)}
			{question.viewerSeasonPlay && (
				<SeasonPlayNote
					play={question.viewerSeasonPlay}
					league={question.league.abbreviation}
				/>
			)}
			{question.seriesStage && (
				<SeriesStageNote stage={question.seriesStage} />
			)}
		</VStack>
	)
}
