import { RANK_ITEM_COUNT } from "./generate"

// Everything about a game of Blind Rank follows from the puzzle's items and
// the slots placed so far: which item is up next, whether it's done, and how
// many landed in the right slot. Signed-in play, guest play and a guest's
// import after signing up all go through here.
//
// Slots run 0 (the most) to 4 (the fewest). Items come one at a time, in
// the puzzle's order, and a placed item can't move.

export type RankPlayState = {
	// The slot each placed item went in, in reveal order.
	placements: number[]
	done: boolean
	// The item up next, by its place in the reveal order. Null once done.
	nextIndex: number | null
	// Once done: each item's true slot, and whether it was placed there.
	trueSlots: number[] | null
	correct: boolean[] | null
	correctCount: number | null
}

type Valued = { value: number }

// Each item's true slot: the highest value first.
export function trueSlotsOf(items: readonly Valued[]): number[] {
	const order = items
		.map((item, index) => ({ index, value: item.value }))
		.sort((a, b) => b.value - a.value)
	const slots = Array<number>(items.length).fill(0)
	order.forEach((entry, slot) => {
		slots[entry.index] = slot
	})
	return slots
}

export function evaluateRankPlacements(
	items: readonly Valued[],
	placements: readonly number[],
): RankPlayState {
	const done = placements.length >= items.length
	if (!done) {
		return {
			placements: [...placements],
			done,
			nextIndex: placements.length,
			trueSlots: null,
			correct: null,
			correctCount: null,
		}
	}
	const trueSlots = trueSlotsOf(items)
	const correct = trueSlots.map((slot, i) => placements[i] === slot)
	return {
		placements: [...placements],
		done,
		nextIndex: null,
		trueSlots,
		correct,
		correctCount: correct.filter(Boolean).length,
	}
}

export type RankPlacementRefusal = "finished" | "invalid_slot" | "taken"

// Why `slot` can't take the next item, or null when it can.
export function refuseRankPlacement(
	items: readonly Valued[],
	placements: readonly number[],
	slot: number,
): RankPlacementRefusal | null {
	if (placements.length >= items.length) return "finished"
	if (!Number.isInteger(slot) || slot < 0 || slot >= items.length) {
		return "invalid_slot"
	}
	if (placements.includes(slot)) return "taken"
	return null
}

// Placements held by the browser for a signed-out player, cleaned up before
// they're evaluated or saved: any that couldn't have been made is dropped.
export function legalRankPlacements(
	items: readonly Valued[],
	placements: readonly number[],
): number[] {
	const kept: number[] = []
	for (const slot of placements) {
		if (refuseRankPlacement(items, kept, slot) === null) kept.push(slot)
	}
	return kept
}

// A finished game's squares as a share link carries them, one letter per
// slot from the top: g for the right item, r otherwise. "ggrrg" has 3.
export function rankSquaresCode(state: RankPlayState): string {
	if (!state.correct) return ""
	const bySlot = Array<string>(RANK_ITEM_COUNT).fill("r")
	state.placements.forEach((slot, i) => {
		bySlot[slot] = state.correct?.[i] ? "g" : "r"
	})
	return bySlot.join("")
}

// Whether each slot was right, from a share link's squares, or null when no
// finished game could have them. Exactly four right can't happen: the fifth
// item would have only its own slot left.
export function parseRankSquaresCode(code: string): boolean[] | null {
	const lower = code.toLowerCase()
	if (!new RegExp(`^[gr]{${RANK_ITEM_COUNT}}$`).test(lower)) return null
	const squares = [...lower].map((c) => c === "g")
	if (squares.filter(Boolean).length === RANK_ITEM_COUNT - 1) return null
	return squares
}
