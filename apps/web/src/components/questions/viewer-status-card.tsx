import {
	BASE_POINTS_BY_SHAPE,
	earlyTierFor,
	quipForCall,
	seasonEarlyTierFor,
	TIER_MAX_MULT,
	TIER_MIN_MULT,
	type ToleranceSpec,
	tierFor,
	toleranceBand,
} from "@called-my-shot/scoring"
import { type ReactNode, useState } from "react"
import { css, cx } from "styled-system/css"
import { Flex, HStack, VStack } from "styled-system/jsx"
import { ShareImagePanel } from "#/components/profile/share-image-panel"
import {
	CallShareCardPreview,
	type CallShareCardPreviewData,
} from "#/components/questions/call-share-card-preview"
import { CaseBlock } from "#/components/questions/case-block"
import { DisputeModal } from "#/components/questions/dispute-modal"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { pickSummary, resultState } from "#/lib/call-summary"
import { formatGuess } from "#/lib/field-signal"
import type { QuestionDetailState } from "#/lib/question-detail-state"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
	shareCardShapeLabel,
} from "#/lib/question-labels"
import { previewNumericPoints, previewSelectionPoints } from "#/lib/scoring"
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
	PLAYER_GAME_STAT_LEADER: BASE_POINTS_BY_SHAPE.player_game_stat_leader,
	YES_NO_PROP: BASE_POINTS_BY_SHAPE.yes_no_prop,
	PLAYER_SEASON_AWARD: BASE_POINTS_BY_SHAPE.player_season_award,
	TEAM_SEASON_AWARD: BASE_POINTS_BY_SHAPE.team_season_award,
	PLAYER_AWARD_FINALISTS: BASE_POINTS_BY_SHAPE.player_award_finalists,
}

// Which cast-call layout a shape uses (see castCallBucketFor in
// cast-call-form/use-cast-call-form.ts for the same split on the casting
// side) - this file needs it for which per-pick row renders (numeric vs.
// option) and whether a single field summarizes the whole call.
function isNumericShape(shape: QuestionShape): boolean {
	return (
		shape === "PLAYER_STAT_NUMERIC_GUESS" ||
		shape === "TEAM_STAT_NUMERIC_GUESS" ||
		shape === "TEAM_SEASON_STAT_NUMERIC_GUESS"
	)
}

// Mirrors SEASON_LONG_SHAPES/isSeasonLongShape in @called-my-shot/scoring -
// same GQL/DB casing bridge as BASE_POINTS_BY_GQL_SHAPE above, kept as an
// explicit list rather than derived so a shape added on one side isn't
// silently assumed to match the other. Determines which earliness preview a
// pending pick's row shows: seasonEarlyTierFor (games played so far) for
// these, earlyTierFor (rank among callers) for everything else.
function isSeasonLongShape(shape: QuestionShape): boolean {
	return (
		shape === "PLAYER_SEASON_STAT_OVER_UNDER" ||
		shape === "TEAM_SEASON_STAT_OVER_UNDER" ||
		shape === "PLAYER_VS_PLAYER_SEASON" ||
		shape === "PLAYER_SEASON_AWARD" ||
		shape === "TEAM_SEASON_AWARD" ||
		shape === "PLAYER_AWARD_FINALISTS" ||
		shape === "TEAM_SEASON_STAT_NUMERIC_GUESS"
	)
}

type ViewerCall = {
	id: string
	guessValue: number | null
	conviction: number | null
	totalPoints: number | null
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
	state: QuestionDetailState
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
	viewerCall: ViewerCall | null
	hasViewerDispute: boolean
	// Once any dispute on this question has been closed (upheld or
	// overturned), the dispute process is done for good - no new "under
	// review" banner, no new "Dispute this resolution" button.
	hasSettledDispute: boolean
	// The actual resolved outcome - null until settled. Lives inside this
	// card (not as a separate banner up near the title) because it's the
	// same information the badge/points above are about: what happened,
	// paired with what the viewer did or didn't do about it.
	answer: string | null
	resolutionNote: string | null
	// The correct answer's fieldPct (or numericHitRatePct for a guess) - null
	// until settled. "how rare was being right" belongs next to the outcome
	// itself, not buried in the per-pick breakdown below.
	fieldAccuracyPct: number | null
	// Everything below feeds the win/loss share card only - the question's
	// own identity (not the resolved answer, which is what's already shown
	// above as the badge/title) plus who's sharing it.
	questionTitle: string
	leagueAbbr: string
	shape: QuestionShape
	viewerName: string
	viewerUsername: string
}

// Pending / locked-no-call / resolved-no-call / won / lost are five faces of
// the exact same question: "where do things stand between the viewer and
// this question." Used to be a dedicated PendingCallCard plus three separate
// inline blocks in the route - four near-identical card shells with the same
// badge-then-content layout, diverging only in which badge and which content.
// One component, one switch on state, instead of that hand-maintained
// duplication.
export function ViewerStatusCard({
	questionId,
	state,
	callCount,
	totalOptions,
	numericTolerancePct,
	numericToleranceAbsolute,
	isRateStat,
	viewerCall,
	hasViewerDispute,
	hasSettledDispute,
	answer,
	resolutionNote,
	fieldAccuracyPct,
	questionTitle,
	leagueAbbr,
	shape,
	viewerName,
	viewerUsername,
}: Props) {
	// A resolution can be disputed by anyone who saw it, not just people who
	// called - a spectator can just as easily notice a wrong result. Gated on
	// the question not already being under an active dispute (the banner
	// above already communicates that state) and on the dispute process not
	// having already run its course once (hasSettledDispute) - a resolution
	// that's already been upheld or overturned is final, further correction
	// is an admin action, not another caller dispute.
	const disputeRow = state.isSettled &&
		!state.isDisputed &&
		!hasSettledDispute && (
			<DisputeRow questionId={questionId} hasDispute={hasViewerDispute} />
		)
	const resultTitle = answer && (
		<ResultTitle answer={answer} disputed={state.isDisputed} />
	)
	// The resolver's free-text caption, not the answer itself - reads as a
	// comment attached to the resolution, same "labeled quote" treatment
	// CaseBlock already gives a caller's own reasoning elsewhere on this
	// page. Always last in the card, after the outcome and the dispute
	// action, not wedged between the title and everything else about it.
	const noteBlock = resolutionNote && (
		<CaseBlock text={resolutionNote} label="Resolution note" />
	)

	if (!viewerCall) {
		if (state.isLocked && !state.isSettled) {
			return (
				<Shell tone="neutral">
					<StatusPill tone="neutral">Locked</StatusPill>
					<Sub>Check back once this resolves.</Sub>
				</Shell>
			)
		}
		if (state.isSettled) {
			return (
				<Shell tone="neutral">
					<StatusPill tone="neutral">Resolved</StatusPill>
					{resultTitle}
					{disputeRow}
					{noteBlock}
				</Shell>
			)
		}
		// Open and never called - nothing to report yet, CastCallForm owns this state.
		return null
	}

	if (!state.isSettled) {
		return (
			<PendingContent
				isLocked={state.isLocked}
				numericTolerancePct={numericTolerancePct}
				numericToleranceAbsolute={numericToleranceAbsolute}
				isRateStat={isRateStat}
				callCount={callCount}
				totalOptions={totalOptions}
				viewerCall={viewerCall}
			/>
		)
	}

	const isNumeric = isNumericShape(viewerCall.question.shape)
	const basePoints = BASE_POINTS_BY_GQL_SHAPE[viewerCall.question.shape]
	const result = resultState(viewerCall.totalPoints)
	const tone =
		result.status === "win"
			? "success"
			: result.status === "loss"
				? "danger"
				: "neutral"
	return (
		<Shell tone={tone}>
			<StatusPill tone={tone}>
				{result.status === "pending"
					? "Pending"
					: result.status === "win"
						? "You called it"
						: "Missed"}
			</StatusPill>
			<VStack gap="1" alignItems="flex-start">
				{resultTitle}
				{fieldAccuracyPct !== null && (
					<span className={crowdStatClass}>
						{Math.round(fieldAccuracyPct)}% of the crowd nailed this
					</span>
				)}
			</VStack>
			{result.status !== "pending" && (
				<PointsFinal points={result.points} win={result.status === "win"} />
			)}
			<VStack gap="1.5" alignItems="stretch">
				{isNumeric
					? viewerCall.guessValue !== null &&
						viewerCall.conviction !== null && (
							<NumericPickRow
								guessValue={viewerCall.guessValue}
								conviction={viewerCall.conviction}
								tolerance={toleranceSpecFrom(
									numericTolerancePct,
									numericToleranceAbsolute,
								)}
								rank={viewerCall.currentRank}
								totalCalls={callCount}
								basePoints={basePoints}
								result={
									viewerCall.totalPoints === null
										? { kind: "preview" }
										: {
												kind: "resolved",
												totalPoints: viewerCall.totalPoints,
												closenessMult: viewerCall.closenessMult,
												closenessFieldPct: viewerCall.closenessFieldPct,
											}
								}
							/>
						)
					: viewerCall.selections.map((selection) => (
							<SelectionPickRow
								key={selection.option.label}
								label={optionDisplayLabel(
									selection.option.label,
									isOverUnderQuestionShape(viewerCall.question.shape),
									viewerCall.question.ouLine,
									isRateStat,
								)}
								fieldPct={selection.option.fieldPct}
								totalOptions={totalOptions}
								conviction={selection.conviction}
								rank={viewerCall.currentRank}
								totalCalls={callCount}
								shape={viewerCall.question.shape}
								seasonGamesPlayed={viewerCall.seasonGamesPlayed}
								seasonTotalGames={viewerCall.seasonTotalGames}
								basePoints={basePoints}
								// A single pick's name is already up in the title - only
								// player_season_award/team_season_award (several picks,
								// none of them named up top) needs each row to say what it is.
								showName={viewerCall.selections.length > 1}
								result={
									selection.option.isCorrect === null ||
									selection.resultPoints === null
										? { kind: "preview" }
										: {
												kind: "resolved",
												isCorrect: selection.option.isCorrect,
												points: selection.resultPoints,
											}
								}
							/>
						))}
			</VStack>
			{result.status !== "pending" && (
				<ShareCallSection
					viewerCall={viewerCall}
					isWin={result.status === "win"}
					points={result.points}
					questionTitle={questionTitle}
					leagueAbbr={leagueAbbr}
					categoryLabel={shareCardShapeLabel[shape]}
					viewerName={viewerName}
					viewerUsername={viewerUsername}
					numericToleranceAbsolute={numericToleranceAbsolute}
					isRateStat={isRateStat}
				/>
			)}
			{disputeRow}
			{noteBlock}
		</Shell>
	)
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

// Assembles the win/loss share card and hands it to ShareImagePanel - same
// Copy/Save machinery the profile stats card uses (see share-image-panel.tsx),
// just fed a call's result instead of a career stat line. Only ever rendered
// once the question has settled (see the win/loss branch above), so there's
// always a real outcome to share.
function ShareCallSection({
	viewerCall,
	isWin,
	points,
	questionTitle,
	leagueAbbr,
	categoryLabel,
	viewerName,
	viewerUsername,
	numericToleranceAbsolute,
	isRateStat,
}: {
	viewerCall: ViewerCall
	isWin: boolean
	points: number
	questionTitle: string
	leagueAbbr: string
	categoryLabel: string
	viewerName: string
	viewerUsername: string
	numericToleranceAbsolute: number | null
	isRateStat: boolean
}) {
	// Deterministic off the call's own id (see quipForCall) rather than
	// random - the same call always shows the same line, every time it's
	// reopened, on both this preview and the exported PNG (apps/api's
	// call-card.ts calls the same function against the same id), with
	// nothing needing to be persisted or passed between the two.
	const quip = quipForCall(viewerCall.id, isWin)

	const isNumeric = isNumericShape(viewerCall.question.shape)
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
	// A single number describes exactly one pick's rarity - a numeric-guess
	// shape (closenessFieldPct) or a lone selection both qualify,
	// player_season_award/team_season_award's several independent picks
	// don't, so that case is left null rather than picking one pick's
	// fieldPct to stand in for the whole call.
	const fieldPct = isNumeric
		? viewerCall.closenessFieldPct
		: viewerCall.selections.length === 1
			? (viewerCall.selections[0]?.option.fieldPct ?? null)
			: null
	const conviction = isNumeric
		? (viewerCall.conviction ?? 0)
		: viewerCall.selections.length > 0
			? Math.round(
					viewerCall.selections.reduce((sum, s) => sum + s.conviction, 0) /
						viewerCall.selections.length,
				)
			: 0

	const data: CallShareCardPreviewData = {
		questionTitle,
		leagueAbbr,
		categoryLabel,
		name: viewerName,
		username: viewerUsername,
		pickLabel,
		isWin,
		points,
		fieldPct,
		conviction,
		caseText: viewerCall.caseText,
		quip,
	}

	return (
		<ShareImagePanel
			src={`/share/calls/${viewerCall.id}`}
			filename={`${viewerUsername}-call-${viewerCall.id}.png`}
			label="Share this call"
			shareType="call_result"
			renderPreview={(previewProps) => (
				<CallShareCardPreview {...previewProps} data={data} />
			)}
		/>
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
	hasDispute,
}: {
	questionId: string
	hasDispute: boolean
}) {
	return (
		<HStack
			justify="space-between"
			gap="2"
			flexWrap="wrap"
			className={disputeRowClass}
		>
			{hasDispute ? (
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
			) : (
				<button
					type="button"
					onClick={() => openModal(<DisputeModal questionId={questionId} />)}
					className={disputeLinkClass}
				>
					Dispute this resolution
				</button>
			)}
		</HStack>
	)
}

// The card shown once the viewer's own call is locked in and awaiting a
// result - one row per pick with its live "if right / if wrong" payout
// preview, using the same scoring formula CastCallForm shows while picking
// (see #/lib/scoring) so the number never jumps between the two screens.
function PendingContent({
	isLocked,
	numericTolerancePct,
	numericToleranceAbsolute,
	isRateStat,
	callCount,
	totalOptions,
	viewerCall,
}: {
	isLocked: boolean
	numericTolerancePct: number | null
	numericToleranceAbsolute: number | null
	isRateStat: boolean
	callCount: number
	totalOptions: number
	viewerCall: ViewerCall
}) {
	const isNumeric = isNumericShape(viewerCall.question.shape)
	const basePoints = BASE_POINTS_BY_GQL_SHAPE[viewerCall.question.shape]

	return (
		<Shell tone="primary">
			<StatusPill tone="primary" live>
				{isLocked ? "Awaiting resolution" : "Pending"}: your call is locked
			</StatusPill>

			<VStack gap="1.5" alignItems="stretch">
				{isNumeric
					? viewerCall.guessValue !== null &&
						viewerCall.conviction !== null && (
							<NumericPickRow
								guessValue={viewerCall.guessValue}
								conviction={viewerCall.conviction}
								tolerance={toleranceSpecFrom(
									numericTolerancePct,
									numericToleranceAbsolute,
								)}
								rank={viewerCall.currentRank}
								totalCalls={callCount}
								basePoints={basePoints}
								result={{ kind: "preview" }}
							/>
						)
					: viewerCall.selections.map((selection) => (
							<SelectionPickRow
								key={selection.option.label}
								label={optionDisplayLabel(
									selection.option.label,
									isOverUnderQuestionShape(viewerCall.question.shape),
									viewerCall.question.ouLine,
									isRateStat,
								)}
								fieldPct={selection.option.fieldPct}
								totalOptions={totalOptions}
								conviction={selection.conviction}
								rank={viewerCall.currentRank}
								totalCalls={callCount}
								shape={viewerCall.question.shape}
								seasonGamesPlayed={viewerCall.seasonGamesPlayed}
								seasonTotalGames={viewerCall.seasonTotalGames}
								basePoints={basePoints}
								result={{ kind: "preview" }}
							/>
						))}
			</VStack>
		</Shell>
	)
}

// A short ledger, not prose - two rows, each labeled with what it IS
// (COMMITTED, IF RIGHT) rather than just showing bare math. The committed
// amount is colored consistently (orange) everywhere it appears, including
// inside the IF RIGHT math, so it visually reads as "that same number,
// multiplied" rather than an unexplained coincidence. There's no IF WRONG row
// - COMMITTED already IS the downside, so a separate "-130 flat" row would
// just repeat it.
type LedgerRow = { label: string; math: ReactNode }
type Breakdown = { ledger: LedgerRow[]; note?: string }

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
		const combinedMult =
			result.isCorrect && committed !== 0 ? result.points / committed : null
		const earlyMult =
			combinedMult !== null
				? Math.round((combinedMult / tier.mult) * 10) / 10
				: null
		return (
			<PickRowShell
				name={showName ? label : null}
				note={null}
				breakdown={{
					ledger: [
						{
							label: "COMMITTED",
							math: (
								<>
									<span className={mathDefault}>
										{basePoints} × {conviction}% conviction ={" "}
									</span>
									<span className={mathDownside}>{committed}</span>
								</>
							),
						},
						{
							// Matches the shipped mockup's own inconsistency on purpose:
							// a hit still gets labeled "IF RIGHT" (it's explaining the
							// formula, not narrating an event), a miss gets "RESULT"
							// since there's no multiplier story left to tell.
							label: result.isCorrect ? "IF RIGHT" : "RESULT",
							math:
								result.isCorrect && earlyMult !== null ? (
									<>
										<span className={mathDownside}>{committed}</span>
										<span className={mathDefault}>
											{" "}
											× {tier.mult} boldness × {earlyMult} early ={" "}
										</span>
										<span className={mathUpside}>+{result.points}</span>
									</>
								) : (
									<>
										<span className={mathDefault}>
											missed: you lose what you committed ={" "}
										</span>
										<span className={mathLose}>−{Math.abs(result.points)}</span>
									</>
								),
						},
					],
					// The raw number the multiplier came from, not a qualitative
					// label - "33% of the field also picked this" stays true and
					// legible no matter how small the field is, where a label like
					// "ahead of the curve" would read strangely for, say, 1st of 3.
					note: result.isCorrect
						? `${Math.round(fieldPct)}% of the field also picked this`
						: "boldness and early bonuses only pay out on a hit",
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
		fieldPct,
		totalOptions,
		conviction,
		earlyTier,
	)
	const stake = preview.lose // the loss is always the flat, un-multiplied stake
	return (
		<PickRowShell
			name={label}
			note={null}
			breakdown={{
				ledger: [
					{
						label: "COMMITTED",
						math: (
							<>
								<span className={mathDefault}>
									{basePoints} × {conviction}% conviction ={" "}
								</span>
								<span className={mathDownside}>{stake}</span>
							</>
						),
					},
					{
						label: "IF RIGHT",
						math: (
							<>
								<span className={mathDownside}>{stake}</span>
								<span className={mathDefault}>
									{" "}
									× {preview.tier.mult} boldness × {preview.earlyTier.mult}{" "}
									early ={" "}
								</span>
								<span className={mathUpside}>+{preview.win}</span>
							</>
						),
					},
				],
			}}
			payout={<Payout win={preview.win} lose={preview.lose} />}
		/>
	)
}

// Exactly one of numericTolerancePct/numericToleranceAbsolute is ever
// non-null for a given question - see ToleranceSpec in
// @called-my-shot/scoring.
function toleranceSpecFrom(
	pct: number | null,
	absolute: number | null,
): ToleranceSpec | null {
	if (absolute !== null) return { mode: "absolute", amount: absolute }
	if (pct !== null) return { mode: "percentage", pct }
	return null
}

function NumericPickRow({
	guessValue,
	conviction,
	tolerance,
	rank,
	totalCalls,
	basePoints,
	result,
}: {
	guessValue: number
	conviction: number
	tolerance: ToleranceSpec | null
	rank: number
	totalCalls: number
	basePoints: number
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

	if (result.kind === "resolved") {
		const win = result.totalPoints >= 0
		const committed = Math.round(basePoints * (conviction / 100))
		// closenessMult is the real, persisted value (calls.closeness_mult) -
		// not reconstructed. The early multiplier isn't stored separately, but
		// unlike the closeness rank (which needs every other hit on the
		// question to even define), it's exact arithmetic once closenessMult
		// and totalPoints are both known: earlyMult = totalPoints / (committed
		// × closenessMult).
		const earlyMult =
			win && committed !== 0 && result.closenessMult
				? Math.round(
						(result.totalPoints / (committed * result.closenessMult)) * 10,
					) / 10
				: null
		return (
			<PickRowShell
				// A numeric guess is always exactly one pick, and that value is
				// already the whole title up top - never worth a second header.
				name={null}
				note={
					band !== null
						? `within ±${formatGuess(band, isRateStat)} counts as a hit`
						: null
				}
				breakdown={{
					ledger: [
						{
							label: "COMMITTED",
							math: (
								<>
									<span className={mathDefault}>
										{basePoints} × {conviction}% conviction ={" "}
									</span>
									<span className={mathDownside}>{committed}</span>
								</>
							),
						},
						{
							label: win ? "IF RIGHT" : "RESULT",
							math:
								win && result.closenessMult && earlyMult !== null ? (
									<>
										<span className={mathDownside}>{committed}</span>
										<span className={mathDefault}>
											{" "}
											× {result.closenessMult} closeness × {earlyMult} early ={" "}
										</span>
										<span className={mathUpside}>+{result.totalPoints}</span>
									</>
								) : win ? (
									<span className={mathUpside}>+{result.totalPoints}</span>
								) : (
									<>
										<span className={mathDefault}>
											missed: you lose what you committed ={" "}
										</span>
										<span className={mathLose}>
											−{Math.abs(result.totalPoints)}
										</span>
									</>
								),
						},
					],
					// The raw share the multiplier came from, same reasoning as
					// SelectionPickRow's note - a real number ("62% of the field
					// guessed at least this close") stays legible regardless of field
					// size, where a qualitative label wouldn't.
					note: win
						? result.closenessFieldPct !== null
							? `${Math.round(result.closenessFieldPct)}% of the field guessed at least this close`
							: undefined
						: "boldness and early bonuses only pay out on a hit",
				}}
				payout={null}
			/>
		)
	}

	const preview = previewNumericPoints(basePoints, conviction, rank, totalCalls)
	const stake = preview.lose // the loss is always the flat, un-multiplied stake
	return (
		<PickRowShell
			name={formatGuess(guessValue, isRateStat)}
			note={band !== null ? `within ±${band} counts as a hit` : null}
			breakdown={{
				ledger: [
					{
						label: "COMMITTED",
						math: (
							<>
								<span className={mathDefault}>
									{basePoints} × {conviction}% conviction ={" "}
								</span>
								<span className={mathDownside}>{stake}</span>
							</>
						),
					},
					{
						label: "IF RIGHT",
						math: (
							<>
								<span className={mathDownside}>{stake}</span>
								<span className={mathDefault}>
									{" "}
									× {TIER_MIN_MULT}–{TIER_MAX_MULT} closeness ×{" "}
									{preview.earlyTier.mult} early ={" "}
								</span>
								<span className={mathUpside}>
									+{preview.winLow}–{preview.winHigh}
								</span>
							</>
						),
					},
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
