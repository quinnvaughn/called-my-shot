import { Store } from "@tanstack/react-store"

// A signed-out player's Blind Rank game, held in the browser until they have
// an account to save it to (see useImportRankPlacements). Only today's is
// worth keeping, so a game on any other puzzle is dropped. Placements are
// 0-based slots, one per item in reveal order.
export type GuestRankGame = { puzzleId: string; placements: number[] }

const STORAGE_KEY = "cms.blindRank.v1"

// Empty on the server and through hydration; the game page fills it from
// storage once mounted.
export const guestRankGameStore = new Store<GuestRankGame | null>(null)

function readStorage(): GuestRankGame | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		const parsed: unknown = raw ? JSON.parse(raw) : null
		if (
			parsed &&
			typeof parsed === "object" &&
			typeof (parsed as GuestRankGame).puzzleId === "string" &&
			Array.isArray((parsed as GuestRankGame).placements)
		) {
			const game = parsed as GuestRankGame
			return {
				puzzleId: game.puzzleId,
				placements: game.placements.filter((p) => Number.isInteger(p)),
			}
		}
		return null
	} catch {
		return null
	}
}

function write(game: GuestRankGame | null) {
	guestRankGameStore.setState(() => game)
	try {
		if (game) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game))
		else window.localStorage.removeItem(STORAGE_KEY)
	} catch {
		// Blocked or full storage: the game still lives in memory for this visit.
	}
}

// The placements held for `puzzleId`, clearing anything left from another day.
export function restoreGuestRankGame(puzzleId: string): number[] {
	const stored = guestRankGameStore.state ?? readStorage()
	if (stored?.puzzleId !== puzzleId) {
		write({ puzzleId, placements: [] })
		return []
	}
	write(stored)
	return stored.placements
}

export function setGuestRankPlacements(puzzleId: string, placements: number[]) {
	write({ puzzleId, placements })
}

// Read once and cleared, when there's an account to save the game to.
export function takeGuestRankGame(): GuestRankGame | null {
	const game = guestRankGameStore.state ?? readStorage()
	write(null)
	return game && game.placements.length > 0 ? game : null
}
