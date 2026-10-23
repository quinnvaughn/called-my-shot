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

// What a Blind Rank result says, by how many of the five landed in the
// right slot. Four can't happen: the fifth would have only its own slot
// left. Three means exactly one pair was swapped.
const RANK_RESULT_LINES: Record<number, string> = {
	0: "Not one in the right spot.",
	1: "One in the right spot.",
	2: "Two in the right spot.",
	3: "One swap away from perfect.",
	5: "Every one in the right spot.",
}

export function rankResultLine(correctCount: number): string {
	return RANK_RESULT_LINES[correctCount] ?? ""
}

export function rankResultHeadline(correctCount: number): string {
	return correctCount === 5 ? "Perfect" : `${correctCount} of 5`
}
