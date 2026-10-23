import { Store } from "@tanstack/react-store"
import type { SeasonGuess } from "#/graphql/season-puzzles/queries"

// A signed-out player's Name That Season game, held in the browser until they
// have an account to save it to (see useImportSeasonGuesses). Only one game is
// ever worth keeping, today's, so a game on any other puzzle is dropped.
export type GuestSeasonGame = { puzzleId: string; guesses: SeasonGuess[] }

const STORAGE_KEY = "cms.seasonPuzzle.v1"

// Empty on the server and through hydration; the game page fills it from
// storage once mounted.
export const guestSeasonGameStore = new Store<GuestSeasonGame | null>(null)

function readStorage(): GuestSeasonGame | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		const parsed: unknown = raw ? JSON.parse(raw) : null
		if (
			parsed &&
			typeof parsed === "object" &&
			typeof (parsed as GuestSeasonGame).puzzleId === "string" &&
			Array.isArray((parsed as GuestSeasonGame).guesses)
		) {
			const game = parsed as GuestSeasonGame
			return {
				puzzleId: game.puzzleId,
				guesses: game.guesses.filter(
					(g) => typeof g?.teamId === "string" && typeof g?.year === "number",
				),
			}
		}
		return null
	} catch {
		return null
	}
}

function write(game: GuestSeasonGame | null) {
	guestSeasonGameStore.setState(() => game)
	try {
		if (game) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game))
		else window.localStorage.removeItem(STORAGE_KEY)
	} catch {
		// Blocked or full storage: the game still lives in memory for this visit.
	}
}

// The guesses held for `puzzleId`, clearing anything left from another day.
export function restoreGuestSeasonGame(puzzleId: string): SeasonGuess[] {
	const stored = guestSeasonGameStore.state ?? readStorage()
	if (stored?.puzzleId !== puzzleId) {
		write({ puzzleId, guesses: [] })
		return []
	}
	write(stored)
	return stored.guesses
}

export function setGuestSeasonGuesses(
	puzzleId: string,
	guesses: SeasonGuess[],
) {
	write({ puzzleId, guesses })
}

// Read once and cleared, when there's an account to save the game to.
export function takeGuestSeasonGame(): GuestSeasonGame | null {
	const game = guestSeasonGameStore.state ?? readStorage()
	write(null)
	return game && game.guesses.length > 0 ? game : null
}
