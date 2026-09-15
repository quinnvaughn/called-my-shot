import {
	BASE_POINTS_BY_SHAPE,
	earlyTierFor,
	LOSS_RATE_BY_SHAPE,
	seasonEarlyTierFor,
	TIER_MAX_MULT,
	TIER_MIN_MULT,
	type ToleranceSpec,
	tierFor,
	toleranceBand,
} from "@called-my-shot/scoring"
import { Link } from "@tanstack/react-router"
import { type ReactNode, useState } from "react"
import { css, cx } from "styled-system/css"
import { Flex, HStack, VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import {
	buildCallTweet,
	CallShareRow,
} from "#/components/questions/call-share-row"
import { CaseBlock } from "#/components/questions/case-block"
import { DisputeModal } from "#/components/questions/dispute-modal"
import type {
	CallUnscoredReason,
	QuestionShape,
	QuestionVoidedReason,
} from "#/graphql/generated/graphql"
import { pickSummary } from "#/lib/call-summary"
import { formatGuess } from "#/lib/field-signal"
import { formatCallDate } from "#/lib/format-date"
import {
	isNumericQuestionShape,
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"
import {
	formatMult,
	previewNumericPoints,
	previewSelectionPoints,
	toleranceSpecFrom,
} from "#/lib/scoring"
import type {
	CallResult,
	DisputeAction,
	ViewerStatus,
} from "#/lib/viewer-status"
import { openModal } from "#/stores/modal-store"

// GraphQL's QuestionShape is SCREAMING_SNAKE; BASE_POINTS_BY_SHAPE (and the
// rest of @called-my-shot/scoring) key off the API's lower snake_case DB
// enum instead - this is the one explicit place that bridges the two so a
// typo can't silently fall back to the wrong base.
const BASE_POINTS_BY_GQL_SHAPE: Record<QuestionShape, number> = {
	PLAYER_STAT_OVER_UNDER: BASE_POINTS_BY_SHAPE.player_stat_over_under,
	TEAM_STAT_OVER_UNDER: BASE_POINTS_BY_SHAPE.team_stat_over_under,
	PLAYER_SEASON_STAT_OVER_UNDER:
		BASE_POINTS_BY_SHAPE.player_season_stat_over_under,
	TEAM_SEASON_STAT_OVER_UNDER: BASE_POINTS_BY_SHAPE.team_season_stat_over_under,
	GAME_TOTAL_OVER_UNDER: BASE_POINTS_BY_SHAPE.game_total_over_under,
	PLAYER_STAT_NUMERIC_GUESS: BASE_POINTS_BY_SHAPE.player_stat_numeric_guess,
	TEAM_STAT_NUMERIC_GUESS: BASE_POINTS_BY_SHAPE.team_stat_numeric_guess,
	TEAM_SEASON_STAT_NUMERIC_GUESS:
		BASE_POINTS_BY_SHAPE.team_season_stat_numeric_guess,
	PLAYER_VS_PLAYER: BASE_POINTS_BY_SHAPE.player_vs_player,
	PLAYER_VS_PLAYER_SEASON: BASE_POINTS_BY_SHAPE.player_vs_player_season,
	TEAM_VS_TEAM: BASE_POINTS_BY_SHAPE.team_vs_team,
	TEAM_VS_TEAM_SEASON: BASE_POINTS_BY_SHAPE.team_vs_team_season,
	PLAYER_GAME_STAT_LEADER: BASE_POINTS_BY_SHAPE.player_game_stat_leader,
	PLAYER_SEASON_STAT_LEADER: BASE_POINTS_BY_SHAPE.player_season_stat_leader,
	YES_NO_PROP: BASE_POINTS_BY_SHAPE.yes_no_prop,
	PLAYER_SEASON_AWARD: BASE_POINTS_BY_SHAPE.player_season_award,
	TEAM_SEASON_AWARD: BASE_POINTS_BY_SHAPE.team_season_award,
	PLAYER_AWARD_FINALISTS: BASE_POINTS_BY_SHAPE.player_award_finalists,
}

// Same GQL/DB casing bridge as BASE_POINTS_BY_GQL_SHAPE above, for
// LOSS_RATE_BY_SHAPE.
const LOSS_RATE_BY_GQL_SHAPE: Record<QuestionShape, number> = {
	PLAYER_STAT_OVER_UNDER: LOSS_RATE_BY_SHAPE.player_stat_over_under,
	TEAM_STAT_OVER_UNDER: LOSS_RATE_BY_SHAPE.team_stat_over_under,
	PLAYER_SEASON_STAT_OVER_UNDER:
		LOSS_RATE_BY_SHAPE.player_season_stat_over_under,
	TEAM_SEASON_STAT_OVER_UNDER: LOSS_RATE_BY_SHAPE.team_season_stat_over_under,
	GAME_TOTAL_OVER_UNDER: LOSS_RATE_BY_SHAPE.game_total_over_under,
	PLAYER_STAT_NUMERIC_GUESS: LOSS_RATE_BY_SHAPE.player_stat_numeric_guess,
	TEAM_STAT_NUMERIC_GUESS: LOSS_RATE_BY_SHAPE.team_stat_numeric_guess,
	TEAM_SEASON_STAT_NUMERIC_GUESS:
		LOSS_RATE_BY_SHAPE.team_season_stat_numeric_guess,
	PLAYER_VS_PLAYER: LOSS_RATE_BY_SHAPE.player_vs_player,
	PLAYER_VS_PLAYER_SEASON: LOSS_RATE_BY_SHAPE.player_vs_player_season,
	TEAM_VS_TEAM: LOSS_RATE_BY_SHAPE.team_vs_team,
	TEAM_VS_TEAM_SEASON: LOSS_RATE_BY_SHAPE.team_vs_team_season,
	PLAYER_GAME_STAT_LEADER: LOSS_RATE_BY_SHAPE.player_game_stat_leader,
	PLAYER_SEASON_STAT_LEADER: LOSS_RATE_BY_SHAPE.player_season_stat_leader,
	YES_NO_PROP: LOSS_RATE_BY_SHAPE.yes_no_prop,
	PLAYER_SEASON_AWARD: LOSS_RATE_BY_SHAPE.player_season_award,
	TEAM_SEASON_AWARD: LOSS_RATE_BY_SHAPE.team_season_award,
	PLAYER_AWARD_FINALISTS: LOSS_RATE_BY_SHAPE.player_award_finalists,
}

// Mirrors SEASON_LONG_SHAPES/isSeasonLongShape in @called-my-shot/scoring -
// same GQL/DB casing bridge as BASE_POINTS_BY_GQL_SHAPE above, kept as an
// explicit list rather than derived so a shape added on one side isn't
// silently assumed to match the other. Determines which earliness preview a
// pending pick's row shows: seasonEarlyTierFor (games played so far) for
// these, earlyTierFor (rank among callers) for everything else.
//
// A Record, not the boolean || chain this shape of check invites: an
// omission from a chain just reads as false, quietly pricing a pending row
// off rank-among-callers when it should be off season progress. A missing
// key here fails the build instead - the same protection
// BASE_POINTS_BY_GQL_SHAPE above already gets from being a Record.
const SEASON_LONG_BY_GQL_SHAPE: Record<QuestionShape, boolean> = {
	PLAYER_STAT_OVER_UNDER: false,
	TEAM_STAT_OVER_UNDER: false,
	PLAYER_SEASON_STAT_OVER_UNDER: true,
	TEAM_SEASON_STAT_OVER_UNDER: true,
	GAME_TOTAL_OVER_UNDER: false,
	PLAYER_STAT_NUMERIC_GUESS: false,
	TEAM_STAT_NUMERIC_GUESS: false,
	TEAM_SEASON_STAT_NUMERIC_GUESS: true,
	PLAYER_VS_PLAYER: false,
	PLAYER_VS_PLAYER_SEASON: true,
	TEAM_VS_TEAM: false,
	TEAM_VS_TEAM_SEASON: true,
	PLAYER_GAME_STAT_LEADER: false,
	PLAYER_SEASON_STAT_LEADER: true,
	// Not season-long despite having no game: its locksAt is an arbitrary
	// creator-chosen window, not tied to season length - see the note on
	// SEASON_LONG_SHAPES in @called-my-shot/scoring.
	YES_NO_PROP: false,
	PLAYER_SEASON_AWARD: true,
	TEAM_SEASON_AWARD: true,
	PLAYER_AWARD_FINALISTS: true,
}

function isSeasonLongShape(shape: QuestionShape): boolean {
	return SEASON_LONG_BY_GQL_SHAPE[shape]
}

type ViewerCall = {
	id: string
	// ISO. The date the call was made, which the tweet text states.
	createdAt: string
	guessValue: number | null
	conviction: number | null
	totalPoints: number | null
	// Set when resolution left this call out of scoring - see CallResult's
	// "unscored" in #/lib/viewer-status.
	unscoredReason: CallUnscoredReason | null
	currentRank: number
	// Season-long shapes only (null for a game-scoped question) - games
	// already final as of this call's own createdAt, and the total games in
	// the window this question was open for. Paired with seasonTotalGames to
	// preview seasonEarlyTierFor instead of currentRank/callCount's
	// earlyTierFor - see isSeasonLongShape below for which shapes this
	// applies to.
	seasonGamesPlayed: number | null
	seasonTotalGames: number | null
	// The caller's own written reasoning, if they left one - shown on the
	// share card the same way CaseBlock shows it elsewhere on this page.
	caseText: string | null
	// The real closeness multiplier (TIER_MIN_MULT-TIER_MAX_MULT range)
	// applied at resolution (see calls.closeness_mult) - the numeric-guess
	// shapes only, null until resolved and null forever on a miss. Persisted
	// rather than reconstructed: unlike a
	// selection's contrarian tier, closeness rank only exists once every
	// other hit on the question is known.
	closenessMult: number | null
	// The raw share this call's closenessMult was derived from - what % of
	// the whole field guessed at least as close as this call did. Same
	// nullability as closenessMult. Exists purely so the resolved-state
	// breakdown can explain "why this multiplier" with a real number.
	closenessFieldPct: number | null
	question: { shape: QuestionShape; ouLine: number | null }
	selections: {
		conviction: number
		// The authoritative per-pick score, set once at resolution (see
		// call_selections.result_points) - not reconstructed from live rank/
		// fieldPct data, which can drift from whatever those values were at
		// the moment resolution actually ran.
		resultPoints: number | null
		option: {
			label: string
			isCorrect: boolean | null
			fieldPct: number | null
		}
	}[]
}

type Props = {
	questionId: string
	status: ViewerStatus<ViewerCall>
	// See disputeAction in #/lib/viewer-status.
	disputeAction: DisputeAction
	callCount: number
	// The question's total option count, feeding tierFor's relative-rarity
	// normalization (an option's share means something different in a 2-option
	// vs. a 20-option field). Ignored for the numeric-guess shapes, which have
	// no options.
	totalOptions: number
	numericTolerancePct: number | null
	numericToleranceAbsolute: number | null
	// True for a rate stat (batting average, ERA) on ANY shape, including an
	// over/under with no tolerance snapshot of its own - see optionDisplayLabel
	// in #/lib/question-labels. numericToleranceAbsolute above only ever
	// covers the two numeric_guess shapes.
	isRateStat: boolean
	// The actual resolved outcome - null until settled. Lives inside this
	// card (not as a separate banner up near the title) because it's the
	// same information the badge/points above are about: what happened,
	// paired with what the viewer did or didn't do about it.
	answer: string | null
	resolutionNote: string | null
	// Why the question was voided - null unless it was.
	voidedReason: QuestionVoidedReason | null
	// The correct answer's fieldPct (or numericHitRatePct for a guess) - null
	// until settled. "how rare was being right" belongs next to the outcome
	// itself, not buried in the per-pick breakdown below.
	fieldAccuracyPct: number | null
	// Names the thing being shared, in the OS share sheet and the tweet -
	// the question itself, not the resolved answer, which is already shown
	// above as the badge/title.
	questionTitle: string
}

// Pending / locked-no-call / resolved-no-call / won / lost / voided are faces of
// the exact same question: "where do things stand between the viewer and
// this question." Used to be a dedicated PendingCallCard plus three separate
// inline blocks in the route - four near-identical card shells with the same
// badge-then-content layout, diverging only in which badge and which content.
// One component, one match on ViewerStatus, instead of that hand-maintained
// duplication.
export function ViewerStatusCard({
	questionId,
	status,
	disputeAction,
	callCount,
	totalOptions,
	numericTolerancePct,
	numericToleranceAbsolute,
	isRateStat,
	answer,
	resolutionNote,
	voidedReason,
	fieldAccuracyPct,
	questionTitle,
}: Props) {
	const pickRowsProps = {
		callCount,
		totalOptions,
		numericTolerancePct,
		numericToleranceAbsolute,
		isRateStat,
	}
	const disputeRow = (
		<DisputeRow questionId={questionId} action={disputeAction} />
	)
	// The resolver's free-text caption, not the answer itself - reads as a
	// comment attached to the resolution, same "labeled quote" treatment
	// CaseBlock already gives a caller's own reasoning elsewhere on this
	// page. Always last in the card, after the outcome and the dispute
	// action, not wedged between the title and everything else about it.
	const noteBlock = resolutionNote && (
		<CaseBlock text={resolutionNote} label="Resolution note" />
	)

	return (
		match(status)
			.returnType<ReactNode>()
			// Open and never called - nothing to report yet, CastCallForm owns this state.
			.with({ kind: "canCall" }, () => null)
			.with({ kind: "lockedNoCall" }, () => (
				<Shell tone="neutral">
					<StatusPill tone="neutral">Locked</StatusPill>
					<Sub>Check back once this resolves.</Sub>
				</Shell>
			))
			.with({ kind: "resolvedNoCall" }, ({ disputed }) => (
				<Shell tone="neutral">
					<StatusPill tone="neutral">Resolved</StatusPill>
					{answer && <ResultTitle answer={answer} disputed={disputed} />}
					{disputeRow}
					{noteBlock}
				</Shell>
			))
			// The viewer's own call, locked in and awaiting a result - one row
			// per pick with its live "if right / if wrong" payout preview, using
			// the same scoring formula CastCallForm shows while picking (see
			// #/lib/scoring) so the number never jumps between the two screens.
			.with({ kind: "pending" }, ({ call, isLocked }) => (
				<Shell tone="primary">
					<StatusPill tone="primary" live>
						{isLocked ? "Awaiting resolution" : "Pending"}: your call is locked
					</StatusPill>
					<PickRows call={call} settled={false} {...pickRowsProps} />
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
				</Shell>
			))
			.with({ kind: "resolved" }, ({ call, disputed, result }) => {
				const face = resultFace(result)
				return (
					<Shell tone={face.tone}>
						<StatusPill tone={face.tone}>{face.label}</StatusPill>
						{result.status === "unscored" && (
							<Sub>Nobody else called this question.</Sub>
						)}
						<VStack gap="1" alignItems="flex-start">
							{answer && <ResultTitle answer={answer} disputed={disputed} />}
							{fieldAccuracyPct !== null && (
								<span className={crowdStatClass}>
									{Math.round(fieldAccuracyPct)}% of the crowd nailed this
								</span>
							)}
						</VStack>
						{face.outcome && (
							<PointsFinal
								points={face.outcome.points}
								win={face.outcome.isWin}
							/>
						)}
						{result.status !== "unscored" && (
							<PickRows call={call} settled {...pickRowsProps} />
						)}
						<ShareCallSection
							viewerCall={call}
							outcome={face.outcome}
							questionTitle={questionTitle}
							numericToleranceAbsolute={numericToleranceAbsolute}
							isRateStat={isRateStat}
						/>
						{disputeRow}
						{noteBlock}
					</Shell>
				)
			})
			.with({ kind: "voided" }, () => (
				<Shell tone="neutral">
					<StatusPill tone="neutral">Voided</StatusPill>
					<Sub>{voidedText(voidedReason)}</Sub>
					{noteBlock}
				</Shell>
			))
			.exhaustive()
	)
}

// What a voided question's card says in place of a result.
function voidedText(reason: QuestionVoidedReason | null): string {
	return match(reason)
		.with(
			"SUBJECT_DID_NOT_PLAY",
			() => "The player this is about didn't play, so no call on it scores.",
		)
		.with(
			"GAME_NOT_COMPLETED",
			() => "The game wasn't completed, so no call on it scores.",
		)
		.with("TIE", () => "It ended in a tie, so no call on it scores.")
		.with(
			"NO_LEADER",
			() => "Nobody recorded this stat, so no call on it scores.",
		)
		.with("OTHER", null, () => "No call on this question scores.")
		.exhaustive()
}

type ShareOutcome = { isWin: boolean; points: number }

// A settled call's own result as the card presents it: the badge, plus the
// win and points it's shared with (null until the call's points are written).
function resultFace(result: CallResult): {
	tone: Tone
	label: string
	outcome: ShareOutcome | null
} {
	return match(result)
		.returnType<{ tone: Tone; label: string; outcome: ShareOutcome | null }>()
		.with({ status: "pending" }, () => ({
			tone: "neutral",
			label: "Pending",
			outcome: null,
		}))
		.with({ status: "win" }, ({ points }) => ({
			tone: "success",
			label: "You called it",
			outcome: { isWin: true, points },
		}))
		.with({ status: "loss" }, ({ points }) => ({
			tone: "danger",
			label: "Missed",
			outcome: { isWin: false, points },
		}))
		.with({ status: "unscored" }, () => ({
			tone: "neutral",
			label: "Not scored",
			outcome: null,
		}))
		.exhaustive()
}

const crowdStatClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.muted",
})

function PointsFinal({ points, win }: { points: number; win: boolean }) {
	return (
		<span
			className={css({
				fontFamily: "heading",
				fontSize: "2xl",
				color: win ? "success.default" : "danger.default",
			})}
		>
			{win ? "+" : "−"}
			{Math.abs(points)} pts
		</span>
	)
}

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
function ShareCallSection({
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
	return (
		<VStack gap="3" alignItems="stretch">
			<Link
				to="/calls/$callId"
				params={{ callId: viewerCall.id }}
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "primary.default",
					textDecoration: "none",
					_hover: { opacity: 0.8 },
				})}
			>
				View this call →
			</Link>
			<CallShareRow
				callId={viewerCall.id}
				shareTitle={questionTitle}
				surface="question_detail"
				tweetText={buildCallTweet({
					pickLabel,
					points: outcome?.points ?? null,
					isWin: outcome?.isWin ?? null,
					calledAt: formatCallDate(viewerCall.createdAt),
					// This card is only ever the viewer's own call.
					isOwn: true,
				})}
			/>
		</VStack>
	)
}

function ResultTitle({
	answer,
	disputed,
}: {
	answer: string
	disputed: boolean
}) {
	return (
		<span
			className={css({
				fontFamily: "heading",
				fontSize: "xl",
				lineHeight: "1.3",
				color: disputed ? "warning.default" : "fg.default",
			})}
		>
			{disputed && "Disputed: "}
			{answer}
		</span>
	)
}

type Tone = "primary" | "success" | "danger" | "neutral"

// Panda extracts token classes by statically reading the string literals
// passed to css() - a css({ border: t.border }) with `t.border` coming from
// a runtime lookup never gets extracted, so the token just leaks into the
// DOM as an unresolved string and the border silently disappears. Precomputing
// one full literal css() call per tone (border written as a single
// "1px solid {colors.X}" string, never split into border/borderColor) keeps
// every value Panda needs to see sitting directly in the source.
const shellClassByTone: Record<Tone, string> = {
	primary: css({
		position: "relative",
		borderRadius: "xl",
		padding: "5",
		backgroundColor: "primary.default/8",
		border: "1px solid {colors.primary.default/35}",
		borderLeft: "3px solid {colors.primary.default}",
	}),
	success: css({
		position: "relative",
		borderRadius: "xl",
		padding: "5",
		backgroundColor: "success.default/8",
		border: "1px solid {colors.success.default/30}",
	}),
	// Deliberately not tinted red like the other tones - a miss shouldn't
	// read as an alarm, "no shame in a bold miss" already carries that tone
	// in copy, the card itself just stays a plain card.
	danger: css({
		position: "relative",
		borderRadius: "xl",
		padding: "5",
		backgroundColor: "bg.surface",
		border: "1px solid {colors.border.default}",
	}),
	neutral: css({
		position: "relative",
		borderRadius: "xl",
		padding: "5",
		backgroundColor: "bg.surface",
		border: "1px solid {colors.border.default}",
	}),
}

// The one shared shell every state renders into - a bordered card, tinted by
// tone. Only "primary" (pending) earns the accent left-border on top of that:
// it's the one state still awaiting an outcome, so it's the one worth a
// second visual cue to catch the eye.
function Shell({ tone, children }: { tone: Tone; children: ReactNode }) {
	return (
		<VStack gap="3" alignItems="stretch" className={shellClassByTone[tone]}>
			{children}
		</VStack>
	)
}

const pillClassByTone: Record<Tone, string> = {
	primary: css({
		backgroundColor: "primary.subtle",
		color: "primary.default",
	}),
	success: css({
		backgroundColor: "success.subtle",
		color: "success.default",
	}),
	danger: css({
		backgroundColor: "danger.subtle",
		color: "danger.default",
	}),
	neutral: css({
		backgroundColor: "border.default",
		color: "fg.default",
	}),
}

const pillBaseClass = css({
	display: "inline-flex",
	alignSelf: "flex-start",
	fontFamily: "mono",
	fontSize: "2xs",
	fontWeight: "bold",
	letterSpacing: "wide",
	textTransform: "uppercase",
	borderRadius: "sm",
	paddingBlock: "1.5",
	paddingInline: "2.5",
})

function StatusPill({
	tone,
	live,
	children,
}: {
	tone: Tone
	live?: boolean
	children: ReactNode
}) {
	return (
		<HStack gap="1.5" className={cx(pillBaseClass, pillClassByTone[tone])}>
			{live && (
				<span
					className={css({
						width: "1.5",
						height: "1.5",
						borderRadius: "full",
						backgroundColor: "currentColor",
						animation: "pulse 1.6s ease-in-out infinite",
					})}
				/>
			)}
			<span>{children}</span>
		</HStack>
	)
}

function Sub({ children }: { children: ReactNode }) {
	return (
		<span className={css({ fontSize: "sm", color: "fg.muted" })}>
			{children}
		</span>
	)
}

const disputeRowClass = css({
	marginTop: "1",
	paddingTop: "3",
	borderTop: "1px solid {colors.border.default}",
})

const disputeLinkClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: { color: "primary.default" },
})

const disputeStatusClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.muted",
})

// Lives inside the same card as the outcome it's disputing - the mockup this
// was built from nested it in every settled banner (won/lost/resolved-no-
// call) rather than floating it as a separate element below unrelated
// content, and the earlier version of this page did the latter, gated on
// having called at all (which also meant a spectator could never dispute a
// resolution they hadn't personally bet on).
function DisputeRow({
	questionId,
	action,
}: {
	questionId: string
	action: DisputeAction
}) {
	if (action === "hidden") return null

	return (
		<HStack
			justify="space-between"
			gap="2"
			flexWrap="wrap"
			className={disputeRowClass}
		>
			{match(action)
				.with("underReview", () => (
					<HStack gap="1.5" className={disputeStatusClass}>
						<span
							className={css({
								width: "1.5",
								height: "1.5",
								borderRadius: "full",
								backgroundColor: "currentColor",
								animation: "pulse 1.6s ease-in-out infinite",
							})}
						/>
						<span>UNDER REVIEW: you'll get a notification once it's settled</span>
					</HStack>
				))
				.with("available", () => (
					<button
						type="button"
						onClick={() => openModal(<DisputeModal questionId={questionId} />)}
						className={disputeLinkClass}
					>
						Dispute this resolution
					</button>
				))
				.exhaustive()}
		</HStack>
	)
}

// One row per pick: a single row for a numeric guess, one per selection
// otherwise. Before the question settles every row previews its payout; once
// settled, each row shows its real result as soon as that pick's points have
// been written.
function PickRows({
	call,
	settled,
	callCount,
	totalOptions,
	numericTolerancePct,
	numericToleranceAbsolute,
	isRateStat,
}: {
	call: ViewerCall
	settled: boolean
	callCount: number
	totalOptions: number
	numericTolerancePct: number | null
	numericToleranceAbsolute: number | null
	isRateStat: boolean
}) {
	const { shape, ouLine } = call.question
	const basePoints = BASE_POINTS_BY_GQL_SHAPE[shape]
	const lossRate = LOSS_RATE_BY_GQL_SHAPE[shape]

	if (isNumericQuestionShape(shape)) {
		const { guessValue, conviction } = call
		return (
			<VStack gap="1.5" alignItems="stretch">
				{guessValue !== null && conviction !== null && (
					<NumericPickRow
						guessValue={guessValue}
						conviction={conviction}
						tolerance={toleranceSpecFrom(
							numericTolerancePct,
							numericToleranceAbsolute,
						)}
						rank={call.currentRank}
						totalCalls={callCount}
						basePoints={basePoints}
						lossRate={lossRate}
						result={numericRowResult(call, settled)}
					/>
				)}
			</VStack>
		)
	}

	return (
		<VStack gap="1.5" alignItems="stretch">
			{call.selections.map((selection) => (
				<SelectionPickRow
					key={selection.option.label}
					label={optionDisplayLabel(
						selection.option.label,
						isOverUnderQuestionShape(shape),
						ouLine,
						isRateStat,
					)}
					fieldPct={selection.option.fieldPct}
					totalOptions={totalOptions}
					conviction={selection.conviction}
					rank={call.currentRank}
					totalCalls={callCount}
					shape={shape}
					seasonGamesPlayed={call.seasonGamesPlayed}
					seasonTotalGames={call.seasonTotalGames}
					basePoints={basePoints}
					lossRate={lossRate}
					// A single pick's name is already up in the title - only
					// player_season_award/team_season_award (several picks,
					// none of them named up top) needs each row to say what it is.
					showName={call.selections.length > 1}
					result={selectionRowResult(selection, settled)}
				/>
			))}
		</VStack>
	)
}

function selectionRowResult(
	selection: ViewerCall["selections"][number],
	settled: boolean,
): SelectionRowResult {
	const { isCorrect } = selection.option
	if (!settled || isCorrect === null || selection.resultPoints === null) {
		return { kind: "preview" }
	}
	return { kind: "resolved", isCorrect, points: selection.resultPoints }
}

function numericRowResult(
	call: ViewerCall,
	settled: boolean,
): NumericRowResult {
	if (!settled || call.totalPoints === null) return { kind: "preview" }
	return {
		kind: "resolved",
		totalPoints: call.totalPoints,
		closenessMult: call.closenessMult,
		closenessFieldPct: call.closenessFieldPct,
	}
}

// A short ledger, not prose - each row labeled with what it IS (COMMITTED,
// IF RIGHT, IF WRONG) rather than just showing bare math. The committed
// amount is colored consistently (orange) everywhere it appears, including
// inside the other rows' math, so it visually reads as "that same number,
// multiplied" rather than an unexplained coincidence. IF WRONG only appears
// for a shape whose loss rate is under 1 - at a full loss COMMITTED already
// IS the downside, so a separate "-130 flat" row would just repeat it.
type LedgerRow = { label: string; math: ReactNode }
type Breakdown = { ledger: LedgerRow[]; note?: string }
// A resolved pick's second ledger row plus the note under it - both depend on
// whether the pick hit.
type ResultLedger = LedgerRow & { note?: string }

const mathDefault = css({
	fontFamily: "mono",
	fontSize: "xs",
	color: "fg.default",
})
const mathDownside = css({
	fontFamily: "mono",
	fontSize: "xs",
	fontWeight: "bold",
	color: "primary.default",
})
const mathUpside = css({
	fontFamily: "mono",
	fontSize: "xs",
	fontWeight: "bold",
	color: "success.default",
})
const mathLose = css({
	fontFamily: "mono",
	fontSize: "xs",
	fontWeight: "bold",
	color: "danger.default",
})

const missNote = "boldness and early bonuses only pay out on a hit"

function committedRow(
	basePoints: number,
	conviction: number,
	committed: number,
): LedgerRow {
	return {
		label: "COMMITTED",
		math: (
			<>
				<span className={mathDefault}>
					{basePoints} × {conviction}% conviction ={" "}
				</span>
				<span className={mathDownside}>{committed}</span>
			</>
		),
	}
}

// The stored points are authoritative: a call scored at a full loss reads as
// one even on a shape whose loss rate is under 1.
function missedRow(
	points: number,
	committed: number,
	lossRate: number,
): ResultLedger {
	const partial = lossRate !== 1 && Math.abs(points) !== committed
	return {
		label: "RESULT",
		math: (
			<>
				<span className={mathDefault}>
					{partial
						? `missed: ${committed} × ${lossRate} loss rate = `
						: "missed: you lose what you committed = "}
				</span>
				<span className={mathLose}>−{Math.abs(points)}</span>
			</>
		),
		note: missNote,
	}
}

function wrongRows(
	committed: number,
	lossRate: number,
	lose: number,
): LedgerRow[] {
	if (lossRate === 1) return []
	return [
		{
			label: "IF WRONG",
			math: (
				<>
					<span className={mathDownside}>{committed}</span>
					<span className={mathDefault}> × {lossRate} loss rate = </span>
					<span className={mathLose}>−{lose}</span>
				</>
			),
		},
	]
}

// A pick's row renders one of two ways depending on whether the question has
// resolved yet - "preview" (pending) shows the projected range if the pick
// turns out right, "resolved" shows what actually happened. Same row shape,
// same "why these points" ledger either way, which is the whole point: this
// is the one component both the pending card and the won/lost card render
// through, not two near-duplicate ones.
type SelectionRowResult =
	| { kind: "preview" }
	// points is the real call_selections.result_points value, not
	// recomputed from live fieldPct/rank - see the ViewerCall.selections
	// comment for why that distinction matters.
	| { kind: "resolved"; isCorrect: boolean; points: number }
type NumericRowResult =
	| { kind: "preview" }
	// closenessMult and closenessFieldPct are the real, persisted values (null
	// on a miss) - the early multiplier isn't stored separately, but it's
	// exact arithmetic to back out: totalPoints / (committed × closenessMult).
	| {
			kind: "resolved"
			totalPoints: number
			closenessMult: number | null
			closenessFieldPct: number | null
	  }

// Collapsed by default so the card stays a name and a number at a glance -
// the reasoning is one click away, not something everyone has to read past
// every time.
// name is nullable on purpose - when the pick's own name is already showing
// elsewhere on the card (the resolved title, for a single pick), repeating
// it as this row's header too is pure duplication. Only multi-pick cases
// (multi_select, or the pending preview where nothing else names the pick
// yet) pass a real name.
function PickRowShell({
	name,
	note,
	breakdown,
	payout,
}: {
	name: string | null
	note: string | null
	breakdown: Breakdown | null
	payout: ReactNode
}) {
	return (
		<VStack
			gap="1.5"
			alignItems="stretch"
			className={css({
				backgroundColor: "bg.canvas",
				borderRadius: "md",
				paddingBlock: "2.5",
				paddingInline: "3.5",
			})}
		>
			{name !== null && (
				<HStack justify="space-between" gap="3">
					<span
						className={css({
							fontSize: "sm",
							fontWeight: "bold",
							color: "fg.default",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						})}
					>
						{name}
					</span>
					<span
						className={css({
							flexShrink: "0",
							fontFamily: "mono",
							fontSize: "xs",
							whiteSpace: "nowrap",
						})}
					>
						{payout}
					</span>
				</HStack>
			)}
			{note && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.muted",
					})}
				>
					{note}
				</span>
			)}
			{breakdown && <WhyThesePoints breakdown={breakdown} />}
		</VStack>
	)
}

// The toggle and its ledger, split out from PickRowShell so it can stand on
// its own with no pick-name header riding along with it.
function WhyThesePoints({ breakdown }: { breakdown: Breakdown }) {
	const [expanded, setExpanded] = useState(false)
	return (
		<>
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className={css({
					alignSelf: "flex-start",
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.muted",
					cursor: "pointer",
					_hover: { color: "fg.default" },
				})}
			>
				{expanded ? "▾" : "▸"} why these points
			</button>
			{expanded && (
				<VStack
					gap="1.5"
					alignItems="stretch"
					className={css({
						borderTop: "1px solid {colors.border.default}",
						paddingTop: "1.5",
					})}
				>
					{breakdown.ledger.map((row) => (
						// Label-left/math-right in one row runs out of width fast once
						// the math side is a full equation ("200 × 70% conviction =
						// 140") - both sides were nowrap, so on a narrow phone that's
						// two unbreakable strings fighting for ~300px. Stacked below
						// the label instead of squeezed beside it, the equation gets
						// the full row width to itself.
						<Flex
							key={row.label}
							direction={{ base: "column", sm: "row" }}
							justify={{ sm: "space-between" }}
							gap={{ base: "0.5", sm: "3" }}
						>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									color: "fg.muted",
									whiteSpace: "nowrap",
								})}
							>
								{row.label}
							</span>
							<span
								className={css({
									whiteSpace: { base: "normal", sm: "nowrap" },
								})}
							>
								{row.math}
							</span>
						</Flex>
					))}
					{breakdown.note && (
						<span
							className={css({
								fontSize: "xs",
								color: "fg.body",
								lineHeight: "relaxed",
							})}
						>
							{breakdown.note}
						</span>
					)}
				</VStack>
			)}
		</>
	)
}

function SelectionPickRow({
	label,
	fieldPct,
	totalOptions,
	conviction,
	rank,
	totalCalls,
	shape,
	seasonGamesPlayed,
	seasonTotalGames,
	basePoints,
	lossRate,
	result,
	// Only matters once resolved - the pending preview has nothing else
	// naming the pick, so it always shows the name regardless of this flag.
	showName = true,
}: {
	label: string
	fieldPct: number | null
	totalOptions: number
	conviction: number
	rank: number
	totalCalls: number
	shape: QuestionShape
	seasonGamesPlayed: number | null
	seasonTotalGames: number | null
	basePoints: number
	lossRate: number
	result: SelectionRowResult
	showName?: boolean
}) {
	if (fieldPct === null) {
		return <PickRowShell name={label} note={null} breakdown={null} payout="-" />
	}

	if (result.kind === "resolved") {
		// tier comes from live fieldPct, which is safe to reuse post-resolution
		// (same formula, and no new calls can land on a locked question, so it
		// can't drift). The early-caller bonus is not safe to re-derive the
		// same way - it's frozen off rank/totalCalls at the moment resolution
		// actually ran, which isn't guaranteed to equal a live read of those
		// same fields later. Rather than recompute a multiplier that can
		// silently disagree with the real result.points, the combined
		// multiplier is backed out from the authoritative number instead -
		// committed and points are both trustworthy, so committed × mult =
		// points always balances by construction.
		const tier = tierFor(fieldPct, totalOptions)
		const committed = Math.round(basePoints * (conviction / 100))
		// The combined multiplier backed out of the authoritative points value
		// (see comment above), then divided back by the safe/live tier.mult to
		// isolate what the early-caller bonus alone must have been. Both steps
		// stay exact by construction - committed × tier.mult × earlyMult always
		// reproduces result.points, it's never left as an unstated "rest."
		const multipliers =
			result.isCorrect && committed !== 0
				? { boldness: tier.mult, early: result.points / committed / tier.mult }
				: null
		// The raw number the multiplier came from, not a qualitative
		// label - "33% of the field also picked this" stays true and
		// legible no matter how small the field is, where a label like
		// "ahead of the curve" would read strangely for, say, 1st of 3.
		const fieldNote = `${Math.round(fieldPct)}% of the field also picked this`
		// Matches the shipped mockup's own inconsistency on purpose: a hit
		// still gets labeled "IF RIGHT" (it's explaining the formula, not
		// narrating an event), a miss gets "RESULT" since there's no
		// multiplier story left to tell.
		const outcome = match({ isCorrect: result.isCorrect, multipliers })
			.returnType<ResultLedger>()
			.with({ isCorrect: true, multipliers: P.nonNullable }, ({ multipliers }) => ({
				label: "IF RIGHT",
				math: (
					<>
						<span className={mathDownside}>{committed}</span>
						<span className={mathDefault}>
							{" "}
							× {formatMult(multipliers.boldness)} boldness ×{" "}
							{formatMult(multipliers.early)} early ={" "}
						</span>
						<span className={mathUpside}>+{result.points}</span>
					</>
				),
				note: fieldNote,
			}))
			// A zero stake leaves nothing to back the multipliers out of.
			.with({ isCorrect: true }, () => ({
				label: "IF RIGHT",
				math: <span className={mathUpside}>+{result.points}</span>,
				note: fieldNote,
			}))
			.with({ isCorrect: false }, () =>
				missedRow(result.points, committed, lossRate),
			)
			.exhaustive()
		return (
			<PickRowShell
				name={showName ? label : null}
				note={null}
				breakdown={{
					ledger: [committedRow(basePoints, conviction, committed), outcome],
					note: outcome.note,
				}}
				payout={null}
			/>
		)
	}

	// Season-long shapes preview off games played so far, not rank among
	// callers - see isSeasonLongShape's comment. seasonGamesPlayed/
	// seasonTotalGames are only ever null for a game-scoped question (or a
	// season-long one with no games synced yet, where seasonEarlyTierFor's own
	// zero-games guard already lands on the same preseason ceiling), so
	// falling back to earlyTierFor(rank, totalCalls) there is correct either
	// way.
	const earlyTier =
		isSeasonLongShape(shape) &&
		seasonGamesPlayed !== null &&
		seasonTotalGames !== null
			? seasonEarlyTierFor(seasonGamesPlayed, seasonTotalGames)
			: earlyTierFor(rank, totalCalls)
	const preview = previewSelectionPoints(
		basePoints,
		lossRate,
		fieldPct,
		totalOptions,
		conviction,
		earlyTier,
	)
	const committed = Math.round(basePoints * (conviction / 100))
	return (
		<PickRowShell
			name={label}
			note={null}
			breakdown={{
				ledger: [
					committedRow(basePoints, conviction, committed),
					{
						label: "IF RIGHT",
						math: (
							<>
								<span className={mathDownside}>{committed}</span>
								<span className={mathDefault}>
									{" "}
									× {formatMult(preview.tier.mult)} boldness ×{" "}
									{formatMult(preview.earlyTier.mult)} early ={" "}
								</span>
								<span className={mathUpside}>+{preview.win}</span>
							</>
						),
					},
					...wrongRows(committed, lossRate, preview.lose),
				],
			}}
			payout={<Payout win={preview.win} lose={preview.lose} />}
		/>
	)
}

function NumericPickRow({
	guessValue,
	conviction,
	tolerance,
	rank,
	totalCalls,
	basePoints,
	lossRate,
	result,
}: {
	guessValue: number
	conviction: number
	tolerance: ToleranceSpec | null
	rank: number
	totalCalls: number
	basePoints: number
	lossRate: number
	result: NumericRowResult
}) {
	const band = tolerance !== null ? toleranceBand(guessValue, tolerance) : null
	// Absolute mode alone doesn't mean rate stat (a win-total's band is
	// absolute too, e.g. 5) - see isRateStat's own comment in
	// #/lib/field-signal for the full reasoning. tolerance.amount is the real
	// snapshotted value here, not a stand-in, so this checks it directly
	// rather than going through that shared helper (which takes a GraphQL
	// question shape this component doesn't have).
	const isRateStat =
		tolerance?.mode === "absolute" && !Number.isInteger(tolerance.amount)
	const bandNote =
		band !== null
			? `within ±${formatGuess(band, isRateStat)} counts as a hit`
			: null

	if (result.kind === "resolved") {
		const win = result.totalPoints >= 0
		const committed = Math.round(basePoints * (conviction / 100))
		// closenessMult is the real, persisted value (calls.closeness_mult) -
		// not reconstructed. The early multiplier isn't stored separately, but
		// unlike the closeness rank (which needs every other hit on the
		// question to even define), it's exact arithmetic once closenessMult
		// and totalPoints are both known: earlyMult = totalPoints / (committed
		// × closenessMult).
		const multipliers =
			win && committed !== 0 && result.closenessMult
				? {
						closeness: result.closenessMult,
						early: result.totalPoints / (committed * result.closenessMult),
					}
				: null
		// The raw share the multiplier came from, same reasoning as
		// SelectionPickRow's note - a real number ("62% of the field
		// guessed at least this close") stays legible regardless of field
		// size, where a qualitative label wouldn't.
		const closenessNote =
			result.closenessFieldPct !== null
				? `${Math.round(result.closenessFieldPct)}% of the field guessed at least this close`
				: undefined
		const outcome = match({ win, multipliers })
			.returnType<ResultLedger>()
			.with({ win: true, multipliers: P.nonNullable }, ({ multipliers }) => ({
				label: "IF RIGHT",
				math: (
					<>
						<span className={mathDownside}>{committed}</span>
						<span className={mathDefault}>
							{" "}
							× {formatMult(multipliers.closeness)} closeness ×{" "}
							{formatMult(multipliers.early)} early ={" "}
						</span>
						<span className={mathUpside}>+{result.totalPoints}</span>
					</>
				),
				note: closenessNote,
			}))
			.with({ win: true }, () => ({
				label: "IF RIGHT",
				math: <span className={mathUpside}>+{result.totalPoints}</span>,
				note: closenessNote,
			}))
			.with({ win: false }, () =>
				missedRow(result.totalPoints, committed, lossRate),
			)
			.exhaustive()
		return (
			<PickRowShell
				// A numeric guess is always exactly one pick, and that value is
				// already the whole title up top - never worth a second header.
				name={null}
				note={bandNote}
				breakdown={{
					ledger: [committedRow(basePoints, conviction, committed), outcome],
					note: outcome.note,
				}}
				payout={null}
			/>
		)
	}

	const preview = previewNumericPoints(
		basePoints,
		lossRate,
		conviction,
		rank,
		totalCalls,
	)
	const committed = Math.round(basePoints * (conviction / 100))
	return (
		<PickRowShell
			name={formatGuess(guessValue, isRateStat)}
			note={bandNote}
			breakdown={{
				ledger: [
					committedRow(basePoints, conviction, committed),
					{
						label: "IF RIGHT",
						math: (
							<>
								<span className={mathDownside}>{committed}</span>
								<span className={mathDefault}>
									{" "}
									× {TIER_MIN_MULT}–{TIER_MAX_MULT} closeness ×{" "}
									{formatMult(preview.earlyTier.mult)} early ={" "}
								</span>
								<span className={mathUpside}>
									+{preview.winLow}–{preview.winHigh}
								</span>
							</>
						),
					},
					...wrongRows(committed, lossRate, preview.lose),
				],
			}}
			payout={
				<RangePayout
					winLow={preview.winLow}
					winHigh={preview.winHigh}
					lose={preview.lose}
				/>
			}
		/>
	)
}

function Payout({ win, lose }: { win: number; lose: number }) {
	return (
		<>
			<span className={css({ color: "success.default", fontWeight: "bold" })}>
				+{win}
			</span>
			<span className={css({ color: "fg.subtle" })}> / </span>
			<span className={css({ color: "danger.default", fontWeight: "bold" })}>
				−{lose}
			</span>
		</>
	)
}

function RangePayout({
	winLow,
	winHigh,
	lose,
}: {
	winLow: number
	winHigh: number
	lose: number
}) {
	return (
		<>
			<span className={css({ color: "success.default", fontWeight: "bold" })}>
				+{winLow}–{winHigh}
			</span>
			<span className={css({ color: "fg.subtle" })}> / </span>
			<span className={css({ color: "danger.default", fontWeight: "bold" })}>
				−{lose}
			</span>
		</>
	)
}
