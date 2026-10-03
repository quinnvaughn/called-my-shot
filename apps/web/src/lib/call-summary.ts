import {
	type CallMargin,
	callMargin,
	type MarginBasis,
	type MarginVerdict,
	type ToleranceSpec,
} from "@called-my-shot/scoring"
import { match } from "ts-pattern"
import type {
	ImagePlayer,
	ImageTeam,
} from "#/components/ui/player-or-team-image"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	isRateStat as computeIsRateStat,
	formatGuess as formatGuessValue,
} from "#/lib/field-signal"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"

export type CallSummaryData = {
	guessValue: number | null
	conviction: number | null
	totalPoints: number | null
	question: {
		shape: QuestionShape
		ouLine: number | null
		numericActualValue: number | null
		numericToleranceAbsolute: number | null
		// Set alongside numericToleranceAbsolute on the numeric-guess shapes -
		// exactly one of the two is, depending on whether the picked stat is a
		// rate stat. Both are needed to rebuild the ToleranceSpec that grading
		// ran against, which is what callMargin measures a guess with.
		//
		// Optional, like scoredOptions and option.actualValue below, because
		// several callers here only want pickSummary or convictionSummary and
		// have no margin to render. Leaving it out costs them the margin, not a
		// compile error, so a card that does want one has to opt in by
		// selecting the field - which is the right way round: the alternative
		// is every fragment in the app paying for a leader pool's worth of
		// options to render a pick label.
		numericTolerancePct?: number | null
		// The over/under shapes have no tolerance snapshot of their own, so
		// isRateStat below falls back to the picked stat's own tolerance tier
		// value instead - see isRateStat in #/lib/field-signal.
		stat: {
			toleranceTier: { toleranceMode: string; toleranceValue: number } | null
		} | null
		// Winner first, already trimmed by shape - see Question.scoredOptions in
		// the API. Two entries on a head-to-head, just the leader on a leader
		// pool, empty everywhere else.
		scoredOptions?: { label: string; actualValue: number | null }[]
	}
	selections: {
		id: string
		conviction: number
		// actualValue is this caller's OWN pick's number, which is a different
		// question from scoredOptions above: on a leader pool scoredOptions holds
		// whoever led, and this holds whoever they backed. Both are needed to say
		// how far behind the leader they finished.
		option: {
			label: string
			isCorrect: boolean | null
			actualValue?: number | null
			// The real team or player this option is, when it is one - shown
			// beside the pick by PickList. Optional for the same opt-in reason
			// as actualValue.
			team?: ImageTeam | null
			player?: ImagePlayer | null
		}
	}[]
}

function isRateStat(question: CallSummaryData["question"]): boolean {
	return computeIsRateStat(question)
}

// actualSummary reads the question's scored options rather than the caller's
// own selections: on a head-to-head the losing side's number is half the
// story, and the caller may well have picked it.
// scoredOptions is optional on CallSummaryData, since most callers only want
// a pick label, but this function is entirely about those options - so it
// asks for them outright rather than quietly returning null for a caller that
// forgot to select them.
export type ActualSummaryData = {
	question: CallSummaryData["question"] & {
		scoredOptions: NonNullable<CallSummaryData["question"]["scoredOptions"]>
	}
}

// Every shape scores differently, so each needs its own formatting here - an
// over/under selection's label alone ("Over") loses the line the call was
// actually made against.
export function pickSummary(call: CallSummaryData): string {
	return match(call.question.shape)
		.with(
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"PLAYER_SEASON_STAT_OVER_UNDER",
			"TEAM_SEASON_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			() => formatOverUnder(call),
		)
		.with("PLAYER_SEASON_AWARD", "TEAM_SEASON_AWARD", () =>
			formatMultiSelect(call),
		)
		.with(
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_NUMERIC_GUESS",
			"TEAM_SEASON_STAT_NUMERIC_GUESS",
			() => formatGuess(call),
		)
		.with(
			"PLAYER_VS_PLAYER",
			"PLAYER_VS_PLAYER_SEASON",
			"TEAM_VS_TEAM",
			"TEAM_VS_TEAM_SEASON",
			"PLAYER_GAME_STAT_LEADER",
			"PLAYER_SEASON_STAT_LEADER",
			"PLAYER_TEAM_SEASON_STAT_LEADER",
			"YES_NO_PROP",
			"PLAYER_AWARD_FINALISTS",
			() => formatSingleSelection(call),
		)
		.exhaustive()
}

function formatOverUnder(call: CallSummaryData): string {
	const selection = call.selections[0]
	if (!selection) return "-"
	return optionDisplayLabel(
		selection.option.label,
		isOverUnderQuestionShape(call.question.shape),
		call.question.ouLine,
		isRateStat(call.question),
	)
}

// Names the picks whether or not the question has resolved. The verdict and
// points around the label already say how it went, and a label is also
// dropped into sentences ("@quinn called X") where a hit count reads as
// nonsense.
function formatMultiSelect(call: CallSummaryData): string {
	if (call.selections.length === 0) return "-"
	return call.selections.map((s) => s.option.label).join(", ")
}

function formatGuess(call: CallSummaryData): string {
	return call.guessValue !== null
		? formatGuessValue(call.guessValue, isRateStat(call.question))
		: "-"
}

function formatSingleSelection(call: CallSummaryData): string {
	const selection = call.selections[0]
	return selection ? selection.option.label : "-"
}

// Conviction lives in different places depending on shape: the numeric-guess
// shapes set it once on the call itself, single-pick shapes set it on their
// one selection. player_season_award/team_season_award are the one case with
// no single number - up to picksRequired picks, each with independent
// conviction - so that one is averaged and labeled "avg" rather than
// pretending it's one real value.
export function convictionSummary(call: CallSummaryData): string {
	return match(call.question.shape)
		.with(
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_NUMERIC_GUESS",
			"TEAM_SEASON_STAT_NUMERIC_GUESS",
			() => (call.conviction !== null ? `${call.conviction}%` : "-"),
		)
		.with(
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"PLAYER_SEASON_STAT_OVER_UNDER",
			"TEAM_SEASON_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			"PLAYER_VS_PLAYER",
			"PLAYER_VS_PLAYER_SEASON",
			"TEAM_VS_TEAM",
			"TEAM_VS_TEAM_SEASON",
			"PLAYER_GAME_STAT_LEADER",
			"PLAYER_SEASON_STAT_LEADER",
			"PLAYER_TEAM_SEASON_STAT_LEADER",
			"YES_NO_PROP",
			"PLAYER_AWARD_FINALISTS",
			() => {
				const selection = call.selections[0]
				return selection ? `${selection.conviction}%` : "-"
			},
		)
		.with("PLAYER_SEASON_AWARD", "TEAM_SEASON_AWARD", () => {
			if (call.selections.length === 0) return "-"
			const avg =
				call.selections.reduce((sum, s) => sum + s.conviction, 0) /
				call.selections.length
			return `${Math.round(avg)}% avg`
		})
		.exhaustive()
}

// A numeric guess's own resultState comes purely from closeness scoring, not
// a right/wrong answer - so on a loss, showing the actual final value next to
// the conviction is what explains why it lost. A win's own points already
// tell that story, so this is loss-only, and numeric-guess-shape-only (every
// other shape's pick text already states what happened - "Over 47.5" either
// hit or it didn't).
export function lossContext(call: CallSummaryData): string | null {
	if (
		call.question.shape !== "PLAYER_STAT_NUMERIC_GUESS" &&
		call.question.shape !== "TEAM_STAT_NUMERIC_GUESS" &&
		call.question.shape !== "TEAM_SEASON_STAT_NUMERIC_GUESS"
	)
		return null
	if (resultState(call.totalPoints).status !== "loss") return null
	if (call.question.numericActualValue === null) return null
	return `actual was ${formatGuessValue(call.question.numericActualValue, isRateStat(call.question))}`
}

// The tolerance band grading ran against, rebuilt from whichever of the two
// snapshots the question carries. Mirrors toleranceSpec in
// components/questions/cast-call-form/use-cast-call-form.ts - only the
// numeric-guess shapes have one, which is why the line basis passes null and
// lets callMargin fall back to the catalog's Standard tier.
function guessToleranceSpec(
	question: CallSummaryData["question"],
): ToleranceSpec | null {
	if (question.numericToleranceAbsolute !== null) {
		return { mode: "absolute", amount: question.numericToleranceAbsolute }
	}
	if (question.numericTolerancePct != null) {
		return { mode: "percentage", pct: question.numericTolerancePct }
	}
	return null
}

// The over/under shapes have no tolerance snapshot of their own, so the band
// comes off the picked stat's tier - the same place isRateStat reads for the
// same reason.
function statToleranceSpec(
	question: CallSummaryData["question"],
): ToleranceSpec | null {
	const tier = question.stat?.toleranceTier
	if (!tier) return null
	return tier.toleranceMode === "ABSOLUTE"
		? { mode: "absolute", amount: tier.toleranceValue }
		: { mode: "percentage", pct: tier.toleranceValue }
}

// Which two numbers this shape has to subtract, if it has two at all. Yes/No
// and the award shapes never do: their answer is a name, not a number.
function marginBasisFor(call: CallSummaryData): MarginBasis | null {
	const { question } = call
	return match(question.shape)
		.returnType<MarginBasis | null>()
		.with(
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"PLAYER_SEASON_STAT_OVER_UNDER",
			"TEAM_SEASON_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			() =>
				question.numericActualValue !== null && question.ouLine !== null
					? {
							kind: "line",
							actual: question.numericActualValue,
							line: question.ouLine,
							spec: statToleranceSpec(question),
						}
					: null,
		)
		.with(
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_NUMERIC_GUESS",
			"TEAM_SEASON_STAT_NUMERIC_GUESS",
			() => {
				const spec = guessToleranceSpec(question)
				return call.guessValue !== null &&
					question.numericActualValue !== null &&
					spec !== null
					? {
							kind: "guess",
							guess: call.guessValue,
							actual: question.numericActualValue,
							spec,
						}
					: null
			},
		)
		.with(
			"PLAYER_VS_PLAYER",
			"PLAYER_VS_PLAYER_SEASON",
			"TEAM_VS_TEAM",
			"TEAM_VS_TEAM_SEASON",
			"PLAYER_GAME_STAT_LEADER",
			"PLAYER_SEASON_STAT_LEADER",
			"PLAYER_TEAM_SEASON_STAT_LEADER",
			() => {
				const scored = question.scoredOptions ?? []
				const winner = scored[0]
				if (!winner || winner.actualValue === null) return null
				// A head-to-head keeps both sides, so the runner-up is right
				// there. A leader pool is trimmed to whoever led, so the other
				// number has to come off this caller's own pick - which is also
				// why a leader WIN produces nothing: their pick IS the winner,
				// and callMargin drops a gap of zero.
				const other =
					scored[1]?.actualValue ??
					call.selections[0]?.option.actualValue ??
					null
				return other === null
					? null
					: { kind: "gap", winner: winner.actualValue, other }
			},
		)
		.with(
			"YES_NO_PROP",
			"PLAYER_AWARD_FINALISTS",
			"PLAYER_SEASON_AWARD",
			"TEAM_SEASON_AWARD",
			() => null,
		)
		.exhaustive()
}

// How far this call landed from the line it was called against, null until
// the question resolves and whenever the shape has no two numbers to
// subtract. See callMargin in @called-my-shot/scoring for the bands, and note
// that a non-null result with a null verdict is the ordinary case: worth
// stating the distance, not worth a word about it.
export function callMarginFor(call: CallSummaryData): CallMargin | null {
	const result = resultState(call.totalPoints)
	if (result.status === "pending") return null
	const basis = marginBasisFor(call)
	return basis === null ? null : callMargin(basis, result.status === "win")
}

// The four words the card leads with in place of "Called it" / "Missed".
// Deliberately says nothing a reader has to take on faith: each one describes
// the size of the gap the Off by row states underneath it.
export function marginLabel(verdict: MarginVerdict, won: boolean): string {
	return match([verdict, won] as const)
		.with(["narrow", false], () => "Inches away")
		.with(["narrow", true], () => "By a hair")
		.with(["runaway", true], () => "Never in doubt")
		.with(["runaway", false], () => "Not close")
		.exhaustive()
}

// The sub-line under a pick on a feed card or a call row: the caller's
// conviction, then whatever else is worth saying about how it landed. Built
// as clauses rather than one sentence so a shape that has nothing to add
// (a Yes/No, an award) simply contributes nothing.
export function resultContext(call: CallSummaryData): string[] {
	const clauses: string[] = []
	const actual = lossContext(call)
	if (actual) clauses.push(actual)

	const margin = callMarginFor(call)
	if (margin) {
		clauses.push(
			`off by ${formatGuessValue(margin.displayDistance, isRateStat(call.question))}`,
		)
		if (margin.verdict) {
			const result = resultState(call.totalPoints)
			clauses.push(
				marginLabel(margin.verdict, result.status === "win").toLowerCase(),
			)
		}
	}
	return clauses
}

// The points sign is authoritative for win/loss across every shape, not a
// heuristic: selectionPoints (every option-based shape, and each
// player_season_award/team_season_award pick) is negative iff the pick was
// wrong, and numericGuessPoints is never negative at all - a numeric guess is
// scored purely by closeness to the field, so accuracy (hitTolerance) is a
// genuinely separate stat that can disagree with points and shouldn't drive
// this badge (see @called-my-shot/scoring).
export function resultState(
	totalPoints: number | null,
): { status: "pending" } | { status: "win" | "loss"; points: number } {
	if (totalPoints === null) return { status: "pending" }
	return { status: totalPoints >= 0 ? "win" : "loss", points: totalPoints }
}

// What the question actually came out to, stated the way the shape makes it
// mean something. An over/under or a numeric guess has one number and needs no
// more. A head-to-head reads as a scoreline, winner first, because "9" on its
// own doesn't say who put it up or what it beat. A leader pool names whoever
// led. Null where nothing numeric was recorded - a Yes/No, an award, anything
// a person resolved by hand.
//
// scoredOptions arrives winner-first and already trimmed to the options worth
// naming (see Question.scoredOptions in the API), so this only formats.
export function actualSummary(call: ActualSummaryData): string | null {
	const rate = isRateStat(call.question)
	if (call.question.numericActualValue !== null) {
		return formatGuessValue(call.question.numericActualValue, rate)
	}
	const scored = call.question.scoredOptions.filter(
		(option): option is typeof option & { actualValue: number } =>
			option.actualValue !== null,
	)
	const [winner, ...rest] = scored
	if (!winner) return null
	const values = [winner, ...rest]
		.map((option) => formatGuessValue(option.actualValue, rate))
		.join(" to ")
	return `${winner.label}, ${values}`
}

// Call.payout as it reads on a card: "+107" on an option pick, "+80–120" on a
// numeric guess, whose win depends on where the rest of the field lands.
export function formatPayout(payout: {
	winLow: number
	winHigh: number
	lose: number
}): { win: string; lose: string } {
	return {
		win:
			payout.winLow === payout.winHigh
				? `+${payout.winLow}`
				: `+${payout.winLow}–${payout.winHigh}`,
		lose: `−${payout.lose}`,
	}
}
