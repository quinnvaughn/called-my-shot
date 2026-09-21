// How a window's worth of calls is graded. Lives beside the scoring math
// rather than inside it for the same reason ./quips and ./margin do: this
// describes a result after the fact, it never decides what a call is worth.
// Nothing in index.ts imports this.

// Net points divided by points committed, as a percent.
//
// The denominator is pointsCommitted (base x conviction), NOT pointsAtStake
// (base x conviction x lossRate). That distinction is the whole reason this
// number means anything across shapes. A hit and a miss are not symmetric: at
// conviction 50 a yes/no pays +75 and costs -75, while a stat leader pays
// +125 and costs only -31. Dividing by what was risked would let the cheapest
// calls on the board swing a grade four times as hard as the expensive ones,
// so a caller could farm an A by making nothing but stat-leader picks.
//
// Dividing by what was committed has a property worth relying on. At a x1
// multiplier this reduces exactly to
//
//     (hitRate - breakEvenHitRate) / (1 - breakEvenHitRate)
//
// identically for every shape, whatever its loss rate. So the number reads
// the same way regardless of what someone called: how far from break-even to
// perfect did you get. 0 is hitting at exactly the rate the question was
// priced at (see breakEvenHitRate in ./index), 100 is calling every one of
// them right. A stat-leader caller at 40% and an over/under caller at 75%
// both land on +25, and they have genuinely done equally well - 40% against a
// 20% break-even is the same achievement as 75% against 50%.
//
// The contrarian and earliness multipliers only ever apply to the win side,
// so they push a caller above that line without distorting where it sits.
//
// Null when nothing was committed, which is the guard that matters: it has to
// test the denominator itself rather than the settled call count, because
// pointsAtStake can round to 0 on a minimum-conviction call and a window can
// legitimately consist of calls that are all still pending.
export function returnOnCommitted(
	netPoints: number,
	committedPoints: number,
): number | null {
	if (committedPoints <= 0) return null
	return (netPoints / committedPoints) * 100
}

export type Grade = "A+" | "A" | "B" | "C" | "D" | "F"

// Read off the real distribution of per-user, per-window returns in
// production, at the 10th/30th/60th/85th/95th percentiles - not picked to look
// like a school grading scale. The run that produced these saw 17 windows
// averaging 12.3 settled calls, with percentiles at -33.8 / -7.4 / +11.5 /
// +35.1 / +56.0.
//
// Two things to know before retuning:
//
// 1. The median window sits near +10, not 0. In aggregate the system pays
//    slightly above break-even right now, so C is centered on where callers
//    actually land rather than on the theoretical break-even point.
// 2. These will move in both directions as the app grows. More calls per
//    window tightens the distribution (a 12-call window is mostly variance),
//    while a larger field raises returns for the same record, since a
//    contrarian multiplier needs a caller to hold under 20% of a binary
//    question's field to pay anything at all and that almost never happens at
//    this size.
//
// Ordered high to low; gradeForReturn takes the first band a return clears.
export const GRADE_BANDS: readonly { min: number; grade: Grade }[] = [
	{ min: 50, grade: "A+" },
	{ min: 32, grade: "A" },
	{ min: 10, grade: "B" },
	{ min: -8, grade: "C" },
	{ min: -32, grade: "D" },
	{ min: Number.NEGATIVE_INFINITY, grade: "F" },
]

export function gradeForReturn(returnPct: number | null): Grade | null {
	if (returnPct === null) return null
	return GRADE_BANDS.find((band) => returnPct >= band.min)?.grade ?? "F"
}

// How many settled calls a window needs before its letter is shown. A single
// settled stat-leader call that hit is a +400% A+, which says nothing about
// the caller - same problem MIN_EDGE_SAMPLE guards conviction edge against,
// at the smaller scale one day or week can offer. Only the grade is withheld
// below this; the record, the net points and the breakdown are all real at
// any count and still render.
export const REPORT_CARD_MIN_SETTLED = 5
