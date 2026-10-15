import type { EarlyTier, OptionPricing } from "@called-my-shot/scoring"
import { PointsPreviewShell } from "#/components/questions/points-preview-shell"
import {
	formatMult,
	previewNumericPoints,
	previewSelectionPoints,
} from "#/lib/scoring"

type Props =
	| {
			kind: "numeric"
			conviction: number
			basePoints: number
			lossRate: number
	  }
	| {
			kind: "option"
			// The picked option's share of the field's conviction, the share
			// boldness is read off (see previewCrowdPct). null = nothing picked
			// yet, distinct from a genuinely new pick (0 - nobody's picked it
			// yet either, but it IS a pick).
			crowdPct: number | null
			totalOptions: number
			conviction: number
			basePoints: number
			lossRate: number
			// Season-long shapes only (see isSeasonLongShape in
			// @called-my-shot/scoring) - the caller computes this from the
			// question's live seasonGamesPlayed/seasonTotalGames via
			// seasonEarlyTierFor, since unlike rank it's well-defined even before
			// a call exists. Omitted defaults to 1x/STANDARD in
			// previewSelectionPoints, same as every game-scoped shape.
			earlyTier?: EarlyTier
			// The picked side's own price, when it has one - see OptionPricing.
			pricing?: OptionPricing
	  }

// Live "what would this actually pay" preview, shown right where the
// conviction slider is while still picking - not just at the confirm step or
// after locking in. Same math PendingCallCard shows once a call is real
// (previewSelectionPoints/previewNumericPoints in #/lib/scoring). No rank-
// based early bonus here on purpose: that multiplier only rewards calling
// before other people do, and a pick that doesn't exist yet is definitionally
// the last one made so far - rank would always equal totalCalls, i.e. always
// STANDARD (1x). It only becomes meaningful once the call is real and later
// callers can actually land after it, which is what PendingCallCard's early
// tier is for. Season-long shapes are the exception - games played so far
// isn't rank-based, so earlyTier above can (and should) be passed in even
// here, before a call exists.
export function PointsPreview(props: Props) {
	if (props.kind === "numeric") {
		const preview = previewNumericPoints(
			props.basePoints,
			props.lossRate,
			props.conviction,
		)
		return (
			<PointsPreviewShell
				tierText="Bonus depends on how rare your guess turns out to be"
				winText={`+${preview.winLow}–${preview.winHigh}`}
				loseText={`−${preview.lose}`}
			/>
		)
	}

	if (props.crowdPct === null) {
		return (
			<PointsPreviewShell
				tierText="Pick an option to see the points"
				winText={null}
				loseText={null}
			/>
		)
	}

	const preview = previewSelectionPoints(
		props.basePoints,
		props.lossRate,
		props.crowdPct,
		props.totalOptions,
		props.conviction,
		props.earlyTier,
		props.pricing,
	)
	const { tier } = preview
	const early =
		preview.earlyTier.mult > 1
			? `×${formatMult(preview.earlyTier.mult)} early`
			: null
	// A priced side's price sits on one half: the underdog's on its hit, the
	// favorite's on its miss (see sidePrice). Each is named in its own box. It
	// has no boldness tier: the price already pays for how unlikely it is.
	const isFavorite = (props.pricing?.modelHitRate ?? 0) > 0.5
	const bonuses = [
		...(tier ? [`×${formatMult(tier.mult)} boldness`] : []),
		...(early ? [early] : []),
	]
	return (
		<PointsPreviewShell
			tierText={
				props.pricing?.modelHitRate != null
					? `${Math.round(props.crowdPct)}% of points on this side · ${Math.round(props.pricing.modelHitRate * 100)}% expected`
					: `${tier?.label ?? ""} · ${Math.round(props.crowdPct)}% of points on this side`
			}
			tierVal={bonuses.length > 0 ? `${bonuses.join(" · ")} bonus` : undefined}
			winText={`+${preview.win}`}
			winNote={
				preview.winMult > 1
					? `×${formatMult(preview.winMult)} underdog`
					: undefined
			}
			loseText={`−${preview.lose}`}
			loseNote={
				isFavorite ? `×${formatMult(props.lossRate)} favorite` : undefined
			}
		/>
	)
}
