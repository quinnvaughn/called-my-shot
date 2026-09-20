// Self-owns for a call that missed by a hair. See ./index.ts for how one gets
// picked. Kept apart from loss-quips.ts because a generic self-own reads wrong
// on a call that was one yard from landing - "I've made a huge mistake" is
// funny about a whiff and insulting about a near miss.
//
// Every line has to work for a yard, a point, or one place behind a leader, so
// none of them name a unit. They point at the thing that actually happened:
// the call was right and the count wasn't.
export const NARROW_MISS_QUIPS = [
	"Correct in spirit, penalized in points.",
	"Close enough to argue about. Not close enough to score.",
	"Right read. Wrong by a rounding error.",
	"I had the right idea and the wrong arithmetic.",
	"One more and I'm insufferable about this all week.",
	"That is the smallest possible amount of wrong and it still cost the same.",
	"I'd like the record to show how close that was. The record does not care.",
	"I saw it. I just didn't see quite enough of it.",
	"So that's what one short feels like.",
	"The number was in sight. The number did not come.",
	"I was nearer to right than most people get to wrong.",
	"Nailed the call. Missed the count.",
] as const
