import type { SeasonGuessInput } from "../../db/schema"

// Everything about a game of Name That Season follows from the puzzle and
// the guesses made so far: what each guess was worth, which clues are
// showing, whether it's over, and whether the answer can be shown.
// Signed-in play, guest play and a guest's import after signing up all go
// through here, so the three can't drift.
//
// A guess names a franchise and a season. The wrong franchise is a miss and
// the right franchise in the wrong season is close. Either way a wrong guess
// says which way the answer's season is, earlier or later, or that the year
// was right.

export const SEASON_PUZZLE_MAX_GUESSES = 6

export type SeasonPuzzleStatus = "playing" | "solved" | "missed"

export type SeasonGuessOutcome = "hit" | "close" | "miss"

// Which way the answer's season is from a guess's.
export type SeasonGuessDirection = "earlier" | "later"

export type SeasonGuessResult = SeasonGuessInput & {
	outcome: SeasonGuessOutcome
	// Null when the guess had the right year.
	direction: SeasonGuessDirection | null
}

export type SeasonPlayState = {
	guesses: SeasonGuessResult[]
	// Clue 1 to start, one more per wrong guess, all six once it's over.
	clues: string[]
	status: SeasonPuzzleStatus
	// Solved or missed. The answer is shown only then.
	over: boolean
}

export type SeasonPuzzleAnswer = {
	teamId: string
	year: number
	clues: string[]
}

// The franchise-seasons a guess can name in a puzzle's league, as
// "teamId:year".
export type ArchivedSeasons = ReadonlySet<string>

export const seasonKey = (guess: SeasonGuessInput) =>
	`${guess.teamId}:${guess.year}`

export function evaluateSeasonGuesses(
	puzzle: SeasonPuzzleAnswer,
	guesses: readonly SeasonGuessInput[],
): SeasonPlayState {
	const results = guesses.map((guess): SeasonGuessResult => {
		const direction =
			guess.year === puzzle.year
				? null
				: puzzle.year < guess.year
					? "earlier"
					: "later"
		const outcome =
			guess.teamId !== puzzle.teamId
				? "miss"
				: direction === null
					? "hit"
					: "close"
		return { ...guess, outcome, direction }
	})
	const status: SeasonPuzzleStatus = results.some((g) => g.outcome === "hit")
		? "solved"
		: results.length >= SEASON_PUZZLE_MAX_GUESSES
			? "missed"
			: "playing"
	const over = status !== "playing"
	return {
		guesses: results,
		clues: over
			? puzzle.clues
			: puzzle.clues.slice(
					0,
					Math.min(results.length + 1, puzzle.clues.length),
				),
		status,
		over,
	}
}

export type SeasonGuessRefusal = "finished" | "repeat" | "unknown_season"

// Why `guess` can't be the next one, or null when it can.
export function refuseSeasonGuess(
	puzzle: SeasonPuzzleAnswer,
	guesses: readonly SeasonGuessInput[],
	guess: SeasonGuessInput,
	archived: ArchivedSeasons,
): SeasonGuessRefusal | null {
	if (evaluateSeasonGuesses(puzzle, guesses).over) return "finished"
	if (!archived.has(seasonKey(guess))) return "unknown_season"
	if (guesses.some((g) => seasonKey(g) === seasonKey(guess))) return "repeat"
	return null
}

// Guesses held by the browser for a signed-out player, cleaned up before
// they're evaluated or saved: anything that couldn't have been a legal guess
// is dropped, and nothing after the game ended is kept.
export function legalSeasonGuesses(
	puzzle: SeasonPuzzleAnswer,
	guesses: readonly SeasonGuessInput[],
	archived: ArchivedSeasons,
): SeasonGuessInput[] {
	const kept: SeasonGuessInput[] = []
	for (const guess of guesses) {
		if (refuseSeasonGuess(puzzle, kept, guess, archived) === null) {
			kept.push({ teamId: guess.teamId, year: guess.year })
		}
	}
	return kept
}

// How many guesses it took, or null for a miss or a game still going.
export function seasonGuessCount(state: SeasonPlayState): number | null {
	return state.status === "solved" ? state.guesses.length : null
}

// A game's squares as a share link carries them: one letter per guess, r for
// the wrong franchise, y for the right one in the wrong season, g for the
// hit. "ryyg" is solved in 4. The arrows stay in the game.
const CODE: Record<SeasonGuessOutcome, string> = {
	miss: "r",
	close: "y",
	hit: "g",
}

export function seasonSquaresCode(state: SeasonPlayState): string {
	return state.guesses.map((g) => CODE[g.outcome]).join("")
}

// The guesses a share link's squares describe, or null when they couldn't
// come from a finished game: misses and near misses, then a hit, or six
// guesses without one.
export function parseSeasonSquaresCode(
	code: string,
): SeasonGuessOutcome[] | null {
	const lower = code.toLowerCase()
	const solved = /^[ry]{0,5}g$/.test(lower)
	const missed = /^[ry]{6}$/.test(lower)
	if (!solved && !missed) return null
	return [...lower].map((c) =>
		c === "g" ? "hit" : c === "y" ? "close" : "miss",
	)
}
