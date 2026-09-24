import type { CallGifState } from "@called-my-shot/scoring"

// Everything the ladder below reads. A subset of what describeCall returns in
// routes/_app/calls/$callId.tsx, spelled out here so the rule can be tested
// without standing up a whole GraphQL call.
export type CallGifView = {
	isWin: boolean | null
	points: number | null
	questionStatus: string
	closeness: { kind: "exact" } | { kind: "off"; by: string } | null
	margin: { verdict: "narrow" | "runaway" | null } | null
	redo: { originalWasCorrect: boolean | null } | null
}

// Which pool the call draws its reaction gif from.
//
// A priority ladder over facts that are computed independently of each other,
// not a dispatch over one union - a call can be an exact guess AND a runaway
// win at the same time, and something has to break the tie. Written as early
// returns for that reason: match().exhaustive() earns its keep on a cross of
// unions like marginLabel's [verdict, won], and would only bury an ordering
// that is the whole point of this function.
export function callGifState(view: CallGifView): CallGifState {
	// A voided question is unresolved too, so this has to come first or every
	// void would read as an ordinary pending call still waiting on a result.
	if (view.questionStatus === "VOIDED") return "voided"

	// Same test the card itself uses for whether it has a result to state:
	// points, not question status, which lags on a call left unscored.
	if (view.points === null || view.isWin === null) return "pending"

	// An exact guess outranks any margin below it, matching the card's own
	// eyebrow rule: it is the rarer claim, and two superlatives for one result
	// reads as two prizes.
	if (view.closeness?.kind === "exact") return "nailed"

	// A loss where the pick they walked away from was the right one. Outranks
	// every loss state below: it is the better story, and the only reason the
	// abandoned pick is kept at all. Never fires on a numeric guess, where
	// originalWasCorrect stays null because there is no way to know whether
	// the old number would have cleared the tolerance band.
	if (!view.isWin && view.redo?.originalWasCorrect === true) {
		return "should_have_stuck"
	}

	if (view.margin?.verdict === "runaway") {
		return view.isWin ? "never_in_doubt" : "way_off"
	}
	if (view.margin?.verdict === "narrow") {
		return view.isWin ? "by_a_hair" : "inches_away"
	}

	return view.isWin ? "called_it" : "missed"
}
