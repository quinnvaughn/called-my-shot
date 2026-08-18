import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { previewNumericPoints, previewSelectionPoints } from "#/lib/scoring"

type Props =
	| {
			kind: "numeric"
			conviction: number
			basePoints: number
	  }
	| {
			kind: "option"
			// null = nothing picked yet, distinct from a genuinely new pick
			// (fieldPct 0 - nobody's picked it yet either, but it IS a pick).
			fieldPct: number | null
			conviction: number
			basePoints: number
	  }

// Live "what would this actually pay" preview, shown right where the
// conviction slider is while still picking - not just at the confirm step or
// after locking in. Same math PendingCallCard shows once a call is real
// (previewSelectionPoints/previewNumericPoints in #/lib/scoring). No early-
// caller bonus here on purpose: that multiplier only rewards calling before
// other people do, and a pick that doesn't exist yet is definitionally the
// last one made so far - rank would always equal totalCalls, i.e. always
// STANDARD (1x). It only becomes meaningful once the call is real and later
// callers can actually land after it, which is what PendingCallCard's early
// tier is for.
export function PointsPreview(props: Props) {
	if (props.kind === "numeric") {
		const preview = previewNumericPoints(props.basePoints, props.conviction)
		return (
			<PointsPreviewShell
				tierText="Flat multiplier - no boldness bonus for numeric guesses"
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
		props.fieldPct,
		props.conviction,
	)
	return (
		<PointsPreviewShell
			tierText={`${preview.tier.label} · ${Math.round(props.fieldPct)}% of the field agrees`}
			tierVal={`×${preview.tier.mult} boldness bonus`}
			winText={`+${preview.win}`}
			loseText={`−${preview.lose}`}
		/>
	)
}

function PointsPreviewShell({
	tierText,
	tierVal,
	winText,
	loseText,
}: {
	tierText: string
	tierVal?: string
	winText: string | null
	loseText: string | null
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
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
							})}
						>
							IF RIGHT
						</span>
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
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
							})}
						>
							IF WRONG
						</span>
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
