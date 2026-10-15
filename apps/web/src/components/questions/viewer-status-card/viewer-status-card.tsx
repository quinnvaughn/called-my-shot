import type { ReactNode, Ref } from "react"
import { match } from "ts-pattern"
import { CaseBlock } from "#/components/questions/case-block"
import type { GameNextUp } from "#/components/questions/game-strip"
import { NextUpBlock } from "#/components/questions/next-up-block"
import { RedoCta, type RedoOffer } from "#/components/questions/redo-cta"
import { RecordTag } from "#/components/records/record-tag"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type { QuestionPhase } from "#/lib/question-detail-state"
import {
	disputeAction,
	resultFace,
	viewerStatus,
	voidedText,
} from "#/lib/viewer-status"
import { AnswerBlock } from "./answer-block"
import { DisputeRow } from "./dispute-row"
import { PickRows } from "./pick-rows"
import { ResultTitle } from "./result-title"
import { ShareCallSection } from "./share-call-section"
import { StatusCardHeader } from "./status-card-header"
import { StatusCardShell } from "./status-card-shell"
import { Sub } from "./sub"
import type { PickSubject } from "./types"

export const ViewerStatusCardFragment = graphql(`
	fragment ViewerStatusCard_question on Question {
		id
		# Names the thing being shared, in the OS share sheet and the tweet -
		# the question itself, not the resolved answer, which is already shown
		# above as the badge/title.
		title
		callCount
		numericTolerancePct
		numericToleranceAbsolute
		resolutionNote
		# Why the question was voided - null unless it was.
		voidedReason
		hasSettledDispute
		viewerDispute {
			id
		}
		# The question's total option count, feeding tierFor's relative-rarity
		# normalization (an option's share means something different in a
		# 2-option vs. a 20-option field). Ignored for the numeric-guess shapes,
		# which have no options.
		options {
			id
		}
		viewerCall {
			id
			# The date the call was made, which the tweet text states.
			createdAt
			guessValue
			conviction
			totalPoints
			# Set when resolution left this call out of scoring - see
			# CallResult's "unscored" in #/lib/viewer-status.
			unscoredReason
			currentRank
			# Season-long shapes only (null for a game-scoped question) - games
			# already final as of this call's own createdAt, and the total games
			# in the window this question was open for. Paired with
			# seasonTotalGames to preview seasonEarlyTierFor instead of
			# currentRank/callCount's earlyTierFor - see isSeasonLongGqlShape in
			# #/lib/scoring for which shapes this applies to.
			seasonGamesPlayed
			seasonTotalGames
			# The caller's own written reasoning, if they left one - shown on the
			# share card the same way CaseBlock shows it elsewhere on this page.
			caseText
			# The real closeness multiplier (TIER_MIN_MULT-TIER_MAX_MULT range)
			# applied at resolution (see calls.closeness_mult) - the
			# numeric-guess shapes only, null until resolved and null forever on
			# a miss. Persisted rather than reconstructed: unlike a selection's
			# contrarian tier, closeness rank only exists once every other hit on
			# the question is known.
			closenessMult
			# The raw share this call's closenessMult was derived from - what %
			# of the whole field guessed at least as close as this call did. Same
			# nullability as closenessMult. Exists purely so the resolved-state
			# breakdown can explain "why this multiplier" with a real number.
			closenessFieldPct
			# How regularly the viewer plays the league, on a season-long call -
			# see SeasonPlay. Null on any other call.
			seasonPlay {
				weight
				weeksPlayed
				weeksCounted
				settled
			}
			# How far into its series the call was made, on a series question -
			# see SeriesStage. Null on any other call.
			seriesStage {
				gamesPlayed
				bestOf
				weight
			}
			question {
				id
				shape
				isOfficial
				isPriced
				league {
					id
					abbreviation
				}
				ouLine
				# The share of committed points a miss costs - see
				# Question.lossRate.
				lossRate
			}
			selections {
				id
				conviction
				# The authoritative per-pick score, set once at resolution (see
				# call_selections.result_points) - not reconstructed from live
				# rank/fieldPct data, which can drift from whatever those values
				# were at the moment resolution actually ran.
				resultPoints
				# The side's price when the pick was made, which it's scored at -
				# a series question's sides move between games, so the option's
				# own price below can have moved since. Null on an unpriced side.
				lossRate
				winMult
				modelHitRate
				option {
					id
					label
					isCorrect
					fieldPct
					# This option's share of the field's conviction, which its
					# boldness is read off - see crowdTotals.
					crowdPct
					# This side's own price and the model's chance it hits, when
					# the question's sides were priced, else null.
					lossRate
					winMult
					modelHitRate
					# Set when the pick is a real player or team, for its image.
					team {
						...Team_team @unmask
					}
					player {
						id
						name
						headshotUrl
					}
				}
			}
		}
	}
`)

type Props = {
	question: FragmentType<typeof ViewerStatusCardFragment>
	phase: QuestionPhase
	// True for a rate stat (batting average, ERA) on ANY shape, including an
	// over/under with no tolerance snapshot of its own - see optionDisplayLabel
	// in #/lib/question-labels. numericToleranceAbsolute only ever covers the
	// two numeric_guess shapes.
	isRateStat: boolean
	// The actual resolved outcome - null until settled. Lives inside this
	// card (not as a separate banner up near the title) because it's the
	// same information the badge/points above are about: what happened,
	// paired with what the viewer did or didn't do about it.
	answer: string | null
	// The player or team the answer is, shown beside it. Null when the answer
	// is neither, or names several winners.
	answerSubject?: PickSubject | null
	// The correct answer's fieldPct (or numericHitRatePct for a guess) - null
	// until settled. "how rare was being right" belongs next to the outcome
	// itself, not buried in the per-pick breakdown below.
	fieldAccuracyPct: number | null
	// The viewer's own call's margin, as the word the badge leads with
	// ("Inches away", "Never in doubt") - null on the ordinary call and until
	// it settles. Derived in the route rather than here because this card
	// deliberately carries a trimmed ViewerCall, not a whole question's worth
	// of resolved numbers.
	marginLabel: string | null
	// The offer to take this call back, or null when it isn't on offer.
	// Rendered inside the pending face rather than as a card of its own: a
	// redo is an action on the call this card already states, and a second
	// card would read as a second subject.
	redo: RedoOffer | null
	// The next question on this game the viewer hasn't called, shown on the
	// pending face so the card a new call lands on leads straight into the
	// next one. Null off a game or once nothing on it is left open.
	nextUp: GameNextUp | null
	// Attached to the pending face only: the route scrolls it into view when
	// a new call turns the form into this card.
	ref?: Ref<HTMLDivElement>
}

// Pending / locked-no-call / resolved-no-call / won / lost / voided are faces of
// the exact same question: "where do things stand between the viewer and
// this question." Every face shares the same badge-then-content shell and
// differs only in which badge and which content, so one match on ViewerStatus
// picks both.
export function ViewerStatusCard({
	question: questionProp,
	phase,
	isRateStat,
	answer,
	answerSubject = null,
	fieldAccuracyPct,
	marginLabel,
	redo,
	nextUp,
	ref,
}: Props) {
	const question = useFragment(ViewerStatusCardFragment, questionProp)
	const status = viewerStatus(phase, question.viewerCall)
	const {
		id: questionId,
		title: questionTitle,
		numericToleranceAbsolute,
	} = question
	const pickRowsProps = {
		callCount: question.callCount,
		totalOptions: question.options.length,
		numericTolerancePct: question.numericTolerancePct,
		numericToleranceAbsolute,
		isRateStat,
	}
	const disputeRow = (
		<DisputeRow
			questionId={questionId}
			action={disputeAction(status, {
				hasSettledDispute: question.hasSettledDispute,
				hasViewerDispute: question.viewerDispute !== null,
			})}
		/>
	)
	// The resolver's free-text caption, not the answer itself - reads as a
	// comment attached to the resolution, same "labeled quote" treatment
	// CaseBlock already gives a caller's own reasoning elsewhere on this
	// page. Always last in the card, after the outcome and the dispute
	// action, not wedged between the title and everything else about it.
	const noteBlock = question.resolutionNote && (
		<CaseBlock text={question.resolutionNote} label="Resolution note" />
	)

	return (
		match(status)
			.returnType<ReactNode>()
			// Open and never called - nothing to report yet, CastCallForm owns this state.
			.with({ kind: "canCall" }, () => null)
			.with({ kind: "lockedNoCall" }, () => (
				<StatusCardShell>
					<StatusCardHeader
						label="No call"
						tag={<RecordTag tone="neutral">Locked</RecordTag>}
					/>
					<Sub>Check back once this resolves.</Sub>
				</StatusCardShell>
			))
			// No pick to lead with, so the answer itself is the headline.
			.with({ kind: "resolvedNoCall" }, ({ disputed }) => (
				<StatusCardShell>
					<StatusCardHeader
						label="No call"
						tag={<RecordTag tone="neutral">Resolved</RecordTag>}
					/>
					{answer && (
						<ResultTitle
							answer={answer}
							subject={answerSubject}
							disputed={disputed}
						/>
					)}
					{disputeRow}
					{noteBlock}
				</StatusCardShell>
			))
			// The viewer's own call, locked in and awaiting a result - one row
			// per pick with its live "if right / if wrong" payout preview, using
			// the same scoring formula CastCallForm shows while picking (see
			// #/lib/scoring) so the number never jumps between the two screens.
			.with({ kind: "pending" }, ({ call, isLocked }) => (
				<StatusCardShell ref={ref}>
					<StatusCardHeader
						label="Your call"
						tag={
							<RecordTag tone="live">
								{isLocked ? "Awaiting result" : "Pending"}
							</RecordTag>
						}
					/>
					<PickRows
						call={call}
						settled={false}
						// One pick reads as the headline; several (the award
						// ballots) keep a row each.
						hero={call.selections.length <= 1}
						{...pickRowsProps}
					/>
					{/* Directly under the pick it would change, and above the
					share row - taking the call back is a decision about the
					call, where sharing it is what you do once you've settled
					on it. */}
					<RedoCta questionId={questionId} offer={redo} />
					{/* The first thing after the pick itself: the moment a call lands
					is when the next one is easiest to make. */}
					{nextUp && (
						<NextUpBlock fromQuestionId={questionId} nextUp={nextUp} />
					)}
					{/* An unresolved call is the one most worth putting on the record -
					calling something months before it happens is the whole claim - so
					this is here rather than only on the settled face below. */}
					<ShareCallSection
						viewerCall={call}
						outcome={null}
						questionTitle={questionTitle}
						numericToleranceAbsolute={numericToleranceAbsolute}
						isRateStat={isRateStat}
					/>
				</StatusCardShell>
			))
			// Same layout as pending, so the call reads as the same object once
			// it settles: the tag says how it went, the hero trades its "if
			// right / if wrong" pair for the final points, and the answer sits
			// underneath for the miss where it differs from the pick.
			.with({ kind: "resolved" }, ({ call, disputed, result }) => {
				const face = resultFace(result, marginLabel)
				return (
					<StatusCardShell>
						<StatusCardHeader
							label="Your call"
							tag={<RecordTag tone={face.tone}>{face.label}</RecordTag>}
						/>
						{result.status === "unscored" ? (
							<Sub>Nobody else called this question.</Sub>
						) : (
							<PickRows
								call={call}
								settled
								hero={call.selections.length <= 1}
								{...pickRowsProps}
							/>
						)}
						<AnswerBlock
							answer={answer}
							subject={answerSubject}
							disputed={disputed}
							fieldAccuracyPct={fieldAccuracyPct}
						/>
						<ShareCallSection
							viewerCall={call}
							outcome={face.outcome}
							questionTitle={questionTitle}
							numericToleranceAbsolute={numericToleranceAbsolute}
							isRateStat={isRateStat}
						/>
						{disputeRow}
						{noteBlock}
					</StatusCardShell>
				)
			})
			.with({ kind: "voided" }, () => (
				<StatusCardShell>
					<StatusCardHeader
						label={null}
						tag={<RecordTag tone="neutral">Voided</RecordTag>}
					/>
					<Sub>{voidedText(question.voidedReason)}</Sub>
					{noteBlock}
				</StatusCardShell>
			))
			.exhaustive()
	)
}
