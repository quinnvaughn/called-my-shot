import type { EarlyTier, OptionPricing } from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
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
			// null = nothing picked yet, distinct from a genuinely new pick
			// (fieldPct 0 - nobody's picked it yet either, but it IS a pick).
			fieldPct: number | null
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

	if (props.fieldPct === null) {
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
		props.fieldPct,
		props.totalOptions,
		props.conviction,
		props.earlyTier,
		props.pricing,
	)
	const earlyText =
		preview.earlyTier.mult > 1
			? ` · ×${formatMult(preview.earlyTier.mult)} early`
			: ""
	// A priced side's price sits on one half: the underdog's on its hit, the
	// favorite's on its miss (see sidePrice). Each is named in its own box.
	const isFavorite = (props.pricing?.modelHitRate ?? 0) > 0.5
	return (
		<PointsPreviewShell
			tierText={
				props.pricing?.modelHitRate != null
					? `${preview.tier.label} · ${Math.round(props.fieldPct)}% of the field · ${Math.round(props.pricing.modelHitRate * 100)}% expected`
					: `${preview.tier.label} · ${Math.round(props.fieldPct)}% of the field agrees`
			}
			tierVal={`×${formatMult(preview.tier.mult)} boldness${earlyText} bonus`}
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

function PointsPreviewShell({
	tierText,
	tierVal,
	winText,
	winNote,
	loseText,
	loseNote,
}: {
	tierText: string
	tierVal?: string
	winText: string | null
	winNote?: string
	loseText: string | null
	loseNote?: string
}) {
	return (
		<VStack gap="2" alignItems="stretch">
			<HStack justify="space-between" gap="2">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					{tierText}
				</span>
				{tierVal && (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.muted",
							flexShrink: "0",
						})}
					>
						{tierVal}
					</span>
				)}
			</HStack>
			{winText !== null && loseText !== null && (
				<HStack gap="2">
					<VStack
						gap="0.5"
						alignItems="flex-start"
						className={css({
							flex: "1",
							background: "bg.canvas",
							borderRadius: "sm",
							padding: "2",
						})}
					>
						<BoxLabel label="IF RIGHT" note={winNote} />
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "sm",
								fontWeight: "bold",
								color: "success.default",
							})}
						>
							{winText}
						</span>
					</VStack>
					<VStack
						gap="0.5"
						alignItems="flex-start"
						className={css({
							flex: "1",
							background: "bg.canvas",
							borderRadius: "sm",
							padding: "2",
						})}
					>
						<BoxLabel label="IF WRONG" note={loseNote} />
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "sm",
								fontWeight: "bold",
								color: "danger.default",
							})}
						>
							{loseText}
						</span>
					</VStack>
				</HStack>
			)}
		</VStack>
	)
}

// A box's label, with what moved its number off the plain rate beside it.
function BoxLabel({ label, note }: { label: string; note?: string }) {
	return (
		<HStack justify="space-between" gap="2" width="full">
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
			{note && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.muted",
					})}
				>
					{note}
				</span>
			)}
		</HStack>
	)
}
