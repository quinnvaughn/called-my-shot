// What a Name That Season result says about which clue cracked it, on the
// result screen and its share image alike. The clues run in a fixed order
// (record, how it ended, a stat line, the division, a second leader, the
// star), so the guess count says which one the player had last. Null
// guessCount is a miss.
const RESULT_LINES = [
	"Off the record alone.",
	"Named it from how the season ended.",
	"One stat line was all it took.",
	"The division gave it away.",
	"Got it before the star's name came up.",
	"Needed the star's name.",
]

export function seasonResultLine(guessCount: number | null): string {
	if (guessCount === null) return "Even the star's name wasn't enough."
	return RESULT_LINES[guessCount - 1] ?? ""
}
