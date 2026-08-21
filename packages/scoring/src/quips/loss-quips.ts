// Self-owns for a call that missed. See ./index.ts for how one gets picked
// for a given call. Split into its own file (alongside win-quips.ts) since
// this list is expected to keep growing - no reason either one should bloat
// the scoring math in ../index.ts, or each other.
export const LOSS_QUIPS = [
	"In this economy of bad decisions, that was a bold contribution.",
	"I have several thoughts on my performance, none of them nice.",
	"That's gonna be a no from me, and also from the scoreboard.",
	"I would like to speak to the manager of my decision-making.",
	"Well, I'm an idiot. That's a fun new thing to know about myself.",
	"Confidently wrong is still a personality.",
	"I've made a huge mistake.",
	"Somewhere, a dartboard is laughing at me.",
	"I didn't lose. I just experienced success at a later date. Much later.",
	"Bold prediction, humble outcome.",
	"That's what the fans call a 'character-building moment.'",
	"Note to self: stop trusting self.",
] as const
