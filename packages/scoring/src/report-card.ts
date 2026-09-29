// How a window's worth of calls is graded. Lives beside the scoring math
// rather than inside it for the same reason ./margin does: this
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

// How much luck one settled call carries, as its share of the variance of
// a window's return. A call's return on committed is +1 on a hit at x1 and
// -lossRate on a miss. At the break-even hit rate, lossRate / (1 + lossRate),
// the standard deviation of that works out to exactly sqrt(lossRate). So the
// spread follows from the price alone: an over/under at 1.0 swings 100% of
// what was committed, a stat leader tuned to 0.05 swings about 22%, because
// its likely outcome is a miss that costs almost nothing.
//
// Checked against production: 378 settled calls came out at 94% overall and
// 42% for stat leader, in line with their loss rates. The contrarian and
// earliness multipliers widen a hit's payout past x1, so this runs slightly
// under the true spread for calls that earn them.
//
// Summed per selection, weighted by the square of what each one committed,
// since a bigger commitment moves the window's return proportionally more.
// Pass each selection's own rate where a priced line set one.
export function callReturnVariance(
	committedPoints: number,
	lossRate: number,
): number {
	return committedPoints * committedPoints * lossRate
}

// The luck a window's return allows, in percentage points: one standard
// deviation of what a caller hitting exactly at break-even would post on
// these same calls. Takes the window's committed total and the sum of
// callReturnVariance over its settled selections.
export function returnStandardError(
	committedPoints: number,
	varianceSum: number,
): number | null {
	if (committedPoints <= 0 || varianceSum <= 0) return null
	return (Math.sqrt(varianceSum) / committedPoints) * 100
}

// How many standard errors a window's return sits from break-even.
//
// A raw return can't be graded on one scale because the same number means
// different things at different sizes and prices. -7% over 92 over/unders is
// a clear miss, while -13% over 5 is noise; a window of cheap-miss stat
// leader calls has far less luck in it than the same number of over/unders.
// Fixed return bands handed every large window a C and every extreme letter
// to windows of nine calls or fewer.
//
// Centered on break-even (0), not on where callers happen to land, so a C
// means calling about as well as the questions were priced and the scale
// doesn't drift as the field grows.
export function returnScore(returnPct: number, standardError: number): number {
	return returnPct / standardError
}

// Bands on returnScore. By luck alone, a caller hitting exactly at break-even
// lands A+ about 2% of the time and F about 7%. A+ gets the tighter tail
// because it is the letter people share.
//
// What each band needs, as a return, for equal-conviction calls at a 1.0
// loss rate (over/under, head-to-head). Cheaper-miss shapes need less:
//
//                 5 calls   12 calls   30 calls   92 calls
//     A+  >= 2.0    +89%      +58%       +37%       +21%
//     A   >= 1.25   +56%      +36%       +23%       +13%
//     B   >= 0.5    +22%      +14%        +9%        +5%
//     C   >= -0.5   -22%      -14%        -9%        -5%
//     D   >= -1.5   -67%      -43%       -27%       -16%
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
	standardError: number | null,
): Grade | null {
	if (returnPct === null || standardError === null) return null
	const score = returnScore(returnPct, standardError)
	return GRADE_BANDS.find((band) => score >= band.min)?.grade ?? "F"
}

// How many settled calls a window needs before its letter is shown. A single
// settled stat-leader call that hit is a +400% A+, which says nothing about
// the caller - same problem MIN_EDGE_SAMPLE guards conviction edge against,
// at the smaller scale one day or week can offer. Only the grade is withheld
// below this; the record, the net points and the breakdown are all real at
// any count and still render.
export const REPORT_CARD_MIN_SETTLED = 5

// How a day is shaded on a profile's results calendar. The side is the sign
// of what the day netted. The level is how big a day it was against this
// caller's own days: the quartiles of their |net points|, the way GitHub
// shades contributions. Measured in points rather than return because a
// one-call day nets about +/-100% and would read as dark as a full slate.
// Shared by the page and its og:image so both shade a day the same way.
export type CalendarSide = "up" | "down" | "even" | "pending"
export type CalendarLevel = 1 | 2 | 3 | 4

type CalendarDay = { settledCount: number; netPoints: number }

// The three |net| cut points between levels 1-2, 2-3 and 3-4, from every
// settled day that moved.
export function calendarSteps(days: CalendarDay[]): [number, number, number] {
	const sizes = days
		.filter((day) => day.settledCount > 0 && day.netPoints !== 0)
		.map((day) => Math.abs(day.netPoints))
		.sort((a, b) => a - b)
	const at = (q: number) => sizes[Math.floor(q * (sizes.length - 1))] ?? 0
	return [at(0.25), at(0.5), at(0.75)]
}

export function calendarTone(
	day: CalendarDay,
	steps: [number, number, number],
): { side: CalendarSide; level: CalendarLevel } {
	if (day.settledCount === 0) return { side: "pending", level: 1 }
	if (day.netPoints === 0) return { side: "even", level: 1 }
	const size = Math.abs(day.netPoints)
	const level = (steps.filter((step) => size > step).length +
		1) as CalendarLevel
	return { side: day.netPoints > 0 ? "up" : "down", level }
}
