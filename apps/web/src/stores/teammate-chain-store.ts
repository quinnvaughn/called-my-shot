import { Store } from "@tanstack/react-store"
import type { ChainInput } from "#/graphql/teammate-chain/queries"

// A signed-out player's Teammate Chain game, held in the browser until they
// have an account to save it to (see useImportTeammateChain). Only today's is
// worth keeping, so a game on any other puzzle is dropped. The inputs are
// everything they did, in order; the API judges them each time. The times
// are when they pressed Start and when the game ended.
export type GuestChainGame = {
	puzzleId: string
	inputs: ChainInput[]
	startedAt: string | null
	finishedAt: string | null
}

const STORAGE_KEY = "cms.teammateChain.v1"

// Empty on the server and through hydration; the game page fills it from
// storage once mounted.
export const guestChainGameStore = new Store<GuestChainGame | null>(null)

function isInput(value: unknown): value is ChainInput {
	if (!value || typeof value !== "object") return false
	const input = value as { kind?: unknown; playerId?: unknown }
	if (
		input.kind === "HINT" ||
		input.kind === "UNDO" ||
		input.kind === "GIVE_UP"
	)
		return true
	return input.kind === "PICK" && typeof input.playerId === "string"
}

const timeOrNull = (value: unknown) =>
	typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null

function readStorage(): GuestChainGame | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		const parsed: unknown = raw ? JSON.parse(raw) : null
		if (
			parsed &&
			typeof parsed === "object" &&
			typeof (parsed as GuestChainGame).puzzleId === "string" &&
			Array.isArray((parsed as GuestChainGame).inputs)
		) {
			const game = parsed as GuestChainGame
			return {
				puzzleId: game.puzzleId,
				inputs: game.inputs.filter(isInput),
				startedAt: timeOrNull(game.startedAt),
				finishedAt: timeOrNull(game.finishedAt),
			}
		}
		return null
	} catch {
		return null
	}
}

function write(game: GuestChainGame | null) {
	guestChainGameStore.setState(() => game)
	try {
		if (game) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game))
		else window.localStorage.removeItem(STORAGE_KEY)
	} catch {
		// Blocked or full storage: the game still lives in memory for this visit.
	}
}

// The game held for `puzzleId`, clearing anything left from another day.
export function restoreGuestChainGame(puzzleId: string): GuestChainGame {
	const stored = guestChainGameStore.state ?? readStorage()
	if (stored?.puzzleId !== puzzleId) {
		const fresh = { puzzleId, inputs: [], startedAt: null, finishedAt: null }
		write(fresh)
		return fresh
	}
	write(stored)
	return stored
}

export function saveGuestChainGame(game: GuestChainGame) {
	write(game)
}

// Read once and cleared, when there's an account to save the game to. Only a
// game that was started is worth saving.
export function takeGuestChainGame(): GuestChainGame | null {
	const game = guestChainGameStore.state ?? readStorage()
	write(null)
	return game?.startedAt ? game : null
}
