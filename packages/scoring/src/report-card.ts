// How a window's worth of calls is graded. Lives beside the scoring math
// rather than inside it for the same reason ./call-gifs and ./margin do: this
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

// How far one settled call's return lands from its window's return, as a
// commitment-weighted standard deviation in percent. Measured in production
// across 378 settled calls from 19 callers: 94.1 overall, with shapes ranging
// from 42 (stat leader, whose misses are cheap) to 103 (team vs team).
//
// This is mostly a property of the payout rules rather than of the callers.
// Nearly every call settles at roughly +1 or -1 times what was committed, so
// the spread sits near 100 whoever is calling and needs retuning only if the
// shape mix or the multipliers change materially.
export const CALL_RETURN_SPREAD = 95

// How many calls a window is worth for measuring skill. Each call counts in
// proportion to what was committed to it, so a window holding one huge call
// and ten tiny ones behaves like far fewer than eleven: the huge one decides
// the return almost alone. Equal commitments reduce this to the plain count.
//
// Takes the sum of each settled call's commitment and the sum of their
// squares, which is what the report card can accumulate without keeping every
// call around.
export function effectiveCallCount(
	committedPoints: number,
	committedSquares: number,
): number {
	if (committedSquares <= 0) return 0
	return (committedPoints * committedPoints) / committedSquares
}

// How many standard errors a window's return sits from break-even: the return
// over the luck its sample size allows, CALL_RETURN_SPREAD / sqrt(calls).
//
// A raw return can't be graded on one scale because the same number means
// different things at different sizes. -7% over 92 calls is a clear miss,
// while -13% over 5 calls is noise; +43% over 7 calls is a hot week, while
// +20% over 92 is an excellent one. Fixed return bands handed every large
// window a C and every extreme letter to windows of nine calls or fewer.
//
// Centered on break-even (0), not on where callers happen to land, so a C
// means calling about as well as the questions were priced and the scale
// doesn't drift as the field grows.
export function returnScore(
	returnPct: number,
	effectiveCalls: number,
): number {
	return (returnPct * Math.sqrt(effectiveCalls)) / CALL_RETURN_SPREAD
}

// Bands on returnScore. By luck alone, a caller hitting exactly at break-even
// lands A+ about 2% of the time and F about 7%. A+ gets the tighter tail
// because it is the letter people share.
//
// What each band needs, as a return:
//
//                 5 calls   12 calls   30 calls   92 calls
//     A+  >= 2.0    +85%      +55%       +35%       +20%
//     A   >= 1.25   +53%      +34%       +22%       +12%
//     B   >= 0.5    +21%      +14%        +9%        +5%
//     C   >= -0.5   -21%      -14%        -9%        -5%
//     D   >= -1.5   -64%      -41%       -26%       -15%
//
// Ordered high to low; gradeForReturn takes the first band a score clears.
export const GRADE_BANDS: readonly { min: number; grade: Grade }[] = [
	{ min: 2, grade: "A+" },
	{ min: 1.25, grade: "A" },
	{ min: 0.5, grade: "B" },
	{ min: -0.5, grade: "C" },
	{ min: -1.5, grade: "D" },
	{ min: Number.NEGATIVE_INFINITY, grade: "F" },
]

export function gradeForReturn(
	returnPct: number | null,
	effectiveCalls: number,
): Grade | null {
	if (returnPct === null || effectiveCalls <= 0) return null
	const score = returnScore(returnPct, effectiveCalls)
	return GRADE_BANDS.find((band) => score >= band.min)?.grade ?? "F"
}

// How many settled calls a window needs before its letter is shown. A single
// settled stat-leader call that hit is a +400% A+, which says nothing about
// the caller - same problem MIN_EDGE_SAMPLE guards conviction edge against,
// at the smaller scale one day or week can offer. Only the grade is withheld
// below this; the record, the net points and the breakdown are all real at
// any count and still render.
export const REPORT_CARD_MIN_SETTLED = 5
