// The lines the winning side of a fade can send, and which side can send
// which. Fixed choices rather than free text: a gloat is a stake-backed
// reaction to a result, not a comment thread, and a set list keeps it that way.
//
// Shared by the api (validation, pg enum) and the web (the picker, the stamp
// on the Doubters list, the notification) so a line reads the same everywhere
// it appears.
export const GLOAT_MESSAGES = [
	"told_you",
	"wrong_call",
	"think_twice",
	"called_it",
	"faded_and_cashed",
	"wrong_side",
	"check_the_receipt",
] as const

export type GloatMessage = (typeof GLOAT_MESSAGES)[number]

export const GLOAT_TEXT: Record<GloatMessage, string> = {
	told_you: "Told you.",
	wrong_call: "Faded the wrong call.",
	think_twice: "Think twice next time.",
	called_it: "Called it.",
	faded_and_cashed: "Faded and cashed.",
	wrong_side: "Wrong side.",
	check_the_receipt: "Check the receipt.",
}

// Which lines each side of a fade can pick. The target is the call that was
// faded, sending to every doubter who was wrong; the fader is a doubter who
// cashed, sending to the target.
export const GLOAT_OPTIONS: Record<
	"target" | "fader",
	readonly GloatMessage[]
> = {
	target: ["told_you", "wrong_call", "think_twice", "check_the_receipt"],
	fader: ["called_it", "faded_and_cashed", "wrong_side", "check_the_receipt"],
}
