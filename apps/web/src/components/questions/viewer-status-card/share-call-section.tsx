import { Link } from "@tanstack/react-router"
import { HStack } from "styled-system/jsx"
import {
	buildCallTweet,
	CallShareRow,
} from "#/components/questions/call-share-row"
import { arrowLink } from "#/components/ui/arrow-link"
import { pickSummary } from "#/lib/call-summary"
import { formatCallDate } from "#/lib/format-date"
import type { ShareOutcome } from "#/lib/viewer-status"
import type { ViewerCall } from "./types"

// A link to this call's own page - the record worth handing someone - plus
// the ways of handing it over. This used to assemble a whole preview card and
// offer the PNG behind it for copy/download; there is no downloadable call
// image any more, and the image that remains is the og:image the link unfurls
// with.
//
// Deliberately NOT gated on the question having settled. A call made a long
// way ahead of its result is the one most worth putting on the record, and
// gating this on an outcome left that call with no route to its own page at
// all. The page renders a pending face for it, and so does the og card.
export function ShareCallSection({
	viewerCall,
	outcome,
	questionTitle,
	numericToleranceAbsolute,
	isRateStat,
}: {
	viewerCall: ViewerCall
	// Null until the question resolves and the call's points are written.
	outcome: ShareOutcome | null
	questionTitle: string
	numericToleranceAbsolute: number | null
	isRateStat: boolean
}) {
	const pickLabel = pickSummary({
		guessValue: viewerCall.guessValue,
		conviction: viewerCall.conviction,
		totalPoints: viewerCall.totalPoints,
		question: {
			shape: viewerCall.question.shape,
			ouLine: viewerCall.question.ouLine,
			// Not needed here - pickSummary only reads it via lossContext,
			// which this card never calls.
			numericActualValue: null,
			numericToleranceAbsolute,
			// Only pickSummary's over/under branch reads this (falls back to it
			// when numericToleranceAbsolute isn't set - see isRateStat in
			// #/lib/call-summary) - no real stat/tier data needed here, just
			// enough shape to carry the already-computed isRateStat signal.
			// toleranceValue is a non-integer placeholder, never actually
			// displayed - isRateStat only reads whether it's fractional, not its
			// real magnitude.
			stat: isRateStat
				? { toleranceTier: { toleranceMode: "ABSOLUTE", toleranceValue: 0.5 } }
				: null,
		},
		selections: viewerCall.selections.map((s) => ({
			id: s.option.label,
			conviction: s.conviction,
			option: { label: s.option.label, isCorrect: s.option.isCorrect },
		})),
	})
	// One row: the link to the call's page, and the ways of sending it. The
	// call page itself carries the full share block with the URL spelled out.
	return (
		<HStack justify="space-between" gap="3">
			<Link
				to="/calls/$callId"
				params={{ callId: viewerCall.id }}
				className={arrowLink({ tone: "primary", align: "parent" })}
			>
				View this call →
			</Link>
			<CallShareRow
				callId={viewerCall.id}
				shareTitle={questionTitle}
				surface="question_detail"
				layout="icons"
				tweetText={buildCallTweet({
					pickLabel,
					points: outcome?.points ?? null,
					isWin: outcome?.isWin ?? null,
					calledAt: formatCallDate(viewerCall.createdAt),
					// This card is only ever the viewer's own call.
					isOwn: true,
				})}
			/>
		</HStack>
	)
}
