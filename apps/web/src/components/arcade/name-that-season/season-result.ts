// What a Name That Season result looks like everywhere it's drawn: six
// squares, one per guess, and the link that shares them.

export const SEASON_MAX_GUESSES = 6

// hit: the answer. close: the right franchise in the wrong season. miss:
// the wrong franchise.
export type SeasonOutcome = "HIT" | "CLOSE" | "MISS"

export type SeasonSquare = "hit" | "close" | "miss" | "next" | "empty"

const SQUARE: Record<SeasonOutcome, SeasonSquare> = {
	HIT: "hit",
	CLOSE: "close",
	MISS: "miss",
}

// One square per guess, then empties. `active` marks the square the next
// guess fills, for a game still going.
export function seasonSquares(
	outcomes: readonly SeasonOutcome[],
	{ active = false }: { active?: boolean } = {},
): SeasonSquare[] {
	return Array.from({ length: SEASON_MAX_GUESSES }, (_, i) => {
		const outcome = outcomes[i]
		if (outcome) return SQUARE[outcome]
		if (i === outcomes.length && active) return "next"
		return "empty"
	})
}

export function seasonGuessCount(
	outcomes: readonly SeasonOutcome[],
): number | null {
	return outcomes.at(-1) === "HIT" ? outcomes.length : null
}

// The squares as a share link carries them: r for the wrong franchise, y for
// the right one in the wrong season, g for the hit. "ryyg" is solved in 4.
const CODE: Record<SeasonOutcome, string> = { MISS: "r", CLOSE: "y", HIT: "g" }

export function seasonSquaresCode(outcomes: readonly SeasonOutcome[]): string {
	return outcomes.map((o) => CODE[o]).join("")
}

// The outcomes a share link's squares describe, or null when no finished
// game could have them.
export function parseSeasonSquaresCode(code: string): SeasonOutcome[] | null {
	const lower = code.toLowerCase()
	if (!/^[ry]{0,5}g$/.test(lower) && !/^[ry]{6}$/.test(lower)) return null
	return [...lower].map((c) =>
		c === "g" ? "HIT" : c === "y" ? "CLOSE" : "MISS",
	)
}

// `by` is the signed-in player's username, so the page the link opens can
// say whose result it is (once the API has checked it's really theirs).
export function seasonResultPath(
	date: string,
	outcomes: readonly SeasonOutcome[],
	by?: string | null,
): string {
	const path = `/arcade/name-that-season/${date}/${seasonSquaresCode(outcomes)}`
	return by ? `${path}?by=${encodeURIComponent(by)}` : path
}

export function seasonResultHeadline(guessCount: number | null): string {
	if (guessCount === null) return "Missed it"
	if (guessCount === 1) return "First guess"
	return `Got it in ${guessCount}`
}

// "Oct 20", the name a puzzle goes by.
export function seasonDateLabel(date: string): string {
	const [year, month, day] = date.split("-").map(Number)
	if (!year || !month || !day) return date
	return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	})
}

// A guess as the picker reads it, to strike out what it has ruled out.
export type MadeGuess = {
	teamId: string
	year: number
	outcome: SeasonOutcome
	direction: "EARLIER" | "LATER" | null
}

// A franchise is out once a guess on it was the wrong franchise.
export function franchiseRuledOut(
	guesses: readonly MadeGuess[],
	teamId: string,
): boolean {
	return guesses.some((g) => g.teamId === teamId && g.outcome === "MISS")
}

// A season is out once it's been guessed, or any wrong guess's arrow points
// away from it: "earlier" than 2005 rules out 2005 and after for every team.
// A wrong team in the right year (no arrow) rules out every other year.
export function seasonRuledOut(
	guesses: readonly MadeGuess[],
	teamId: string,
	year: number,
): boolean {
	return guesses.some(
		(g) =>
			(g.teamId === teamId && g.year === year) ||
			(g.direction === "EARLIER" && year >= g.year) ||
			(g.direction === "LATER" && year <= g.year) ||
			(g.direction === null && g.outcome !== "HIT" && year !== g.year),
	)
}
