// Shit-talk for a call that hit. See ./index.ts for how one gets picked for
// a given call. Split into its own file (alongside loss-quips.ts) since this
// list is expected to keep growing - no reason either one should bloat the
// scoring math in ../index.ts, or each other.
export const WIN_QUIPS = [
	"I'm kind of a big deal. People know me.",
	"Well, that just happened.",
	"60% of the time, it works every time.",
	"I'm not lucky. I'm just built different, apparently.",
	"Stay classy, field of doubters.",
	"You had one job: pick the right team. I did that job.",
	"This is the part where everyone pretends they also called it.",
	"Print it, frame it, never let me forget it.",
	"I called my shot. The shot listened.",
	"Respect the process. Fear the process.",
	"Some people dream of success. I just checked the box score.",
	"Boom. Roasted. That's you, by the way.",
] as const
