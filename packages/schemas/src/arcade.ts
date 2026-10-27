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

// The running clock while a Teammate Chain game is going: "0:48", "12:05".
export function chainTimeLabel(seconds: number): string {
	const minutes = Math.floor(seconds / 60)
	return `${minutes}:${String(seconds % 60).padStart(2, "0")}`
}

// How long a finished Teammate Chain took: "48s", "1m 34s".
export function chainDurationLabel(seconds: number): string {
	const minutes = Math.floor(seconds / 60)
	const rest = seconds % 60
	return minutes === 0 ? `${rest}s` : `${minutes}m ${rest}s`
}

// What a Teammate Chain result says. Par, the time, hints and misses are
// drawn around it rather than written out. Null links is a game given up.
export function chainResultHeadline(links: number | null): string {
	return links === null ? "Gave up" : `Connected in ${links}`
}

// The nicknames that run to two words. Everywhere else a team's nickname is
// the last word of its full name ("Boston Celtics" -> "Celtics"), the way
// Were You Watching? names a team in its questions.
const TWO_WORD_NICKNAMES = new Set([
	"Trail Blazers",
	"Red Sox",
	"White Sox",
	"Blue Jays",
	"Maple Leafs",
	"Blue Jackets",
	"Red Wings",
	"Golden Knights",
	"Hockey Club",
])

export function teamNickname(fullName: string): string {
	const words = fullName.trim().split(/\s+/)
	const lastTwo = words.slice(-2).join(" ")
	if (words.length > 2 && TWO_WORD_NICKNAMES.has(lastTwo)) return lastTwo
	return words.at(-1) ?? fullName
}

export const possessive = (name: string) =>
	name.endsWith("s") ? `${name}'` : `${name}'s`

// What a Were You Watching? share link carries: "6-7-284" is 6 of 7 in 28.4
// seconds, and a trailing "-h" means they left the page during a question.
export function watchResultCode(run: {
	correct: number
	total: number
	totalMs: number
	clean: boolean
}): string {
	const tenths = Math.round(run.totalMs / 100)
	return `${run.correct}-${run.total}-${tenths}${run.clean ? "" : "-h"}`
}

export type WatchResult = {
	correct: number
	total: number
	seconds: number
	clean: boolean
}

export function parseWatchResultCode(code: string): WatchResult | null {
	const found = /^(\d{1,2})-(\d{1,2})-(\d{1,5})(-h)?$/.exec(code.toLowerCase())
	if (!found) return null
	const correct = Number(found[1])
	const total = Number(found[2])
	if (total === 0 || correct > total) return null
	return { correct, total, seconds: Number(found[3]) / 10, clean: !found[4] }
}

export function watchResultHeadline(correct: number, total: number): string {
	if (correct === total) return "Didn't miss a thing"
	if (correct === 0) return "Were you even watching?"
	return `${correct} of ${total}`
}

// The jab under a Were You Watching? result, by the share of questions
// right.
export function watchResultLine(correct: number, total: number): string {
	if (total === 0) return ""
	const share = correct / total
	if (share === 1) return "You were watching, all right."
	if (share >= 0.75)
		return "You watched. Maybe checked your phone once or twice."
	if (share >= 0.5) return "Half watching, by the look of it."
	if (share >= 0.25) return "Are you sure you watched the game?"
	if (share > 0) return "Did you have it on in another room?"
	return "Not one. Catch the next game."
}
