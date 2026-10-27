import type { ChainMove } from "../../db/schema"

// Everything about a game of Teammate Chain follows from its judged moves:
// the chain so far, the misses, whether it's solved or given up. Signed-in
// play, guest play and a guest's import after signing up all go through
// here, so the three can't drift.
//
// A player names one player at a time. One who shared a team-season with
// the chain's last player (the start player, to begin) is added; anyone
// else is a miss, which counts against nothing but the result's squares.
// When the newest player also played with the target, the chain connects
// and it's solved. Undo takes the newest player back off, free. Links are
// the middle players plus one: start, two players, target is three.
//
// A hint is a clue about a mystery teammate of the chain's last player, one
// who can still reach the target in the links left. Each further hint is
// another clue about the same player, up to CHAIN_CLUE_COUNT, until the
// chain changes and the next hint is about a new one. Hints count against
// the result the way extra links do.

// The most players a chain can hold between the two ends. Past this a player
// has to undo or give up.
export const CHAIN_MAX_MIDDLE = 5

// Clues there are about one mystery teammate (see ./clues.ts).
export const CHAIN_CLUE_COUNT = 4

export type ChainStatus = "playing" | "solved" | "gave_up"

export type ChainEnds = { startPlayerId: string; targetPlayerId: string }

// What a player asks for, before it's judged.
export type ChainInput =
	| { kind: "pick"; playerId: string }
	| { kind: "hint" }
	| { kind: "undo" }
	| { kind: "give_up" }

export type ChainState = {
	moves: ChainMove[]
	// The middle players, in order.
	chain: string[]
	misses: number
	hints: number
	// The mystery teammate the latest hints are about, and how many clues
	// about him are showing. Cleared whenever the chain changes.
	mystery: { playerId: string; clues: number } | null
	status: ChainStatus
	over: boolean
	// Null until it's solved.
	links: number | null
}

export function evaluateChainMoves(moves: readonly ChainMove[]): ChainState {
	const chain: string[] = []
	let misses = 0
	let hints = 0
	let mystery = null as ChainState["mystery"]
	let status: ChainStatus = "playing"
	for (const move of moves) {
		if (status !== "playing") break
		if (move.kind === "add") {
			chain.push(move.playerId)
			mystery = null
			if (move.connects) status = "solved"
		} else if (move.kind === "miss") {
			misses++
		} else if (move.kind === "hint") {
			hints++
			mystery =
				mystery?.playerId === move.playerId
					? { playerId: move.playerId, clues: mystery.clues + 1 }
					: { playerId: move.playerId, clues: 1 }
		} else if (move.kind === "undo") {
			chain.pop()
			mystery = null
		} else {
			status = "gave_up"
		}
	}
	return {
		moves: [...moves],
		chain,
		misses,
		hints,
		mystery,
		status,
		over: status !== "playing",
		links: status === "solved" ? chain.length + 1 : null,
	}
}

export type ChainRefusal =
	| "finished"
	| "repeat"
	| "unknown_player"
	| "chain_full"
	| "nothing_to_undo"
	| "dead_end"
	| "out_of_clues"

// Whether two players shared a team-season.
export type Linked = (a: string, b: string) => boolean

// What judging needs from the league beyond the moves themselves.
export type ChainChecks = {
	linked: Linked
	inLeague: (playerId: string) => boolean
	// A teammate of the chain's last player who can still reach the target in
	// the links left, to be the next mystery. Null at a dead end. The same
	// state has to give the same player, since guest play judges its inputs
	// again on every request.
	mystery: (state: ChainState) => string | null
}

// Why an input can't be made, or null when it can. A pick has to be a
// player from the puzzle's league who isn't already in the chain or one of
// its ends. A hint needs a mystery teammate with a clue left to give.
export function refuseChainInput(
	ends: ChainEnds,
	state: ChainState,
	input: ChainInput,
	checks: Pick<ChainChecks, "inLeague" | "mystery">,
): ChainRefusal | null {
	if (state.over) return "finished"
	if (input.kind === "undo") {
		return state.chain.length === 0 ? "nothing_to_undo" : null
	}
	if (input.kind === "give_up") return null
	if (input.kind === "hint") {
		if (state.mystery) {
			return state.mystery.clues >= CHAIN_CLUE_COUNT ? "out_of_clues" : null
		}
		return checks.mystery(state) ? null : "dead_end"
	}
	if (
		input.playerId === ends.startPlayerId ||
		input.playerId === ends.targetPlayerId ||
		state.chain.includes(input.playerId)
	) {
		return "repeat"
	}
	if (!checks.inLeague(input.playerId)) return "unknown_player"
	if (state.chain.length >= CHAIN_MAX_MIDDLE) return "chain_full"
	return null
}

// The move an allowed input makes.
export function judgeChainInput(
	ends: ChainEnds,
	state: ChainState,
	input: ChainInput,
	checks: Pick<ChainChecks, "linked" | "mystery">,
): ChainMove {
	if (input.kind === "hint") {
		const playerId = state.mystery?.playerId ?? checks.mystery(state)
		if (!playerId) throw new Error("judgeChainInput: hint at a dead end")
		return { kind: "hint", playerId }
	}
	if (input.kind !== "pick") return input
	const last = state.chain.at(-1) ?? ends.startPlayerId
	if (!checks.linked(last, input.playerId)) {
		return { kind: "miss", playerId: input.playerId }
	}
	return {
		kind: "add",
		playerId: input.playerId,
		connects: checks.linked(input.playerId, ends.targetPlayerId),
	}
}

// Judges a run of inputs in order, as guest play and an import send them,
// dropping any that couldn't have been made (a repeat, a player from another
// league, anything after the game ended).
export function judgeChainInputs(
	ends: ChainEnds,
	inputs: readonly ChainInput[],
	checks: ChainChecks,
): ChainMove[] {
	const moves: ChainMove[] = []
	for (const input of inputs) {
		const state = evaluateChainMoves(moves)
		if (refuseChainInput(ends, state, input, checks)) continue
		moves.push(judgeChainInput(ends, state, input, checks))
	}
	return moves
}

// Every player a run of inputs names, with the two ends: what a link lookup
// for judging them has to cover.
export function chainInputPlayers(
	ends: ChainEnds,
	inputs: readonly ChainInput[],
): string[] {
	return [
		...new Set([
			ends.startPlayerId,
			ends.targetPlayerId,
			...inputs.flatMap((input) =>
				input.kind === "pick" ? [input.playerId] : [],
			),
		]),
	]
}

// Seconds from Start to the end of the game, null for a game still going.
export function chainSeconds(
	startedAt: Date,
	finishedAt: Date | null,
): number | null {
	if (!finishedAt) return null
	return Math.max(
		0,
		Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
	)
}

// A day's points on the group's week board: 6 for a chain at par, one fewer
// per link over it and per hint, never below 1 for a solve. Giving up or not
// finishing is worth nothing.
export function chainDayPoints(state: ChainState | null, par: number): number {
	if (state?.status !== "solved" || state.links === null) return 0
	return Math.max(1, 6 - (state.links - par) - state.hints)
}

// A result as a share link carries it: "3-1-2-94" for solved in 3 links
// with 1 miss and 2 hints in 94 seconds, "x-2-0" for a game given up after
// 2 misses and no hints.
export function chainResultCode(
	state: ChainState,
	seconds: number | null,
): string | null {
	if (state.status === "gave_up") return `x-${state.misses}-${state.hints}`
	if (state.status !== "solved" || seconds === null) return null
	return `${state.links}-${state.misses}-${state.hints}-${seconds}`
}

export type ChainResultCode =
	| {
			solved: true
			links: number
			misses: number
			hints: number
			seconds: number
	  }
	| { solved: false; misses: number; hints: number }

export function parseChainResultCode(code: string): ChainResultCode | null {
	const gaveUp = code.match(/^x-(\d{1,3})-(\d{1,3})$/)
	if (gaveUp) {
		return {
			solved: false,
			misses: Number(gaveUp[1]),
			hints: Number(gaveUp[2]),
		}
	}
	const solved = code.match(/^(\d)-(\d{1,3})-(\d{1,3})-(\d{1,6})$/)
	if (!solved) return null
	const links = Number(solved[1])
	if (links < 2 || links > CHAIN_MAX_MIDDLE + 1) return null
	return {
		solved: true,
		links,
		misses: Number(solved[2]),
		hints: Number(solved[3]),
		seconds: Number(solved[4]),
	}
}
