import { listWithAnd, surname } from "./shared-picks"

// What two redrafts of the same class have in common, said plainly under
// someone else's: "You both took Wade at 2 and Bosh at 4." Only the slots
// both reach are compared, since a Top 5 says nothing about pick 12.

type Pick = { slot: number; player: { id: string } }

// Past this many matches, the line counts them instead of naming them.
const NAMED = 3

export function sharedSlotsLine(
	theirs: { slot: number; player: { id: string; name: string } }[],
	mine: Pick[],
): string {
	const mineBySlot = new Map(mine.map((pick) => [pick.slot, pick.player.id]))
	const compared = theirs.filter((pick) => mineBySlot.has(pick.slot))
	const same = compared.filter(
		(pick) => mineBySlot.get(pick.slot) === pick.player.id,
	)
	if (same.length === 0) return "None of your picks are in the same slot."
	if (same.length === compared.length) {
		return theirs.length === mine.length
			? "Same as yours, slot for slot."
			: `Your first ${compared.length} match theirs, slot for slot.`
	}
	if (same.length > NAMED) {
		return `You both put the same player in ${same.length} slots.`
	}
	return `You both took ${listWithAnd(
		same.map((pick) => `${surname(pick.player.name)} at ${pick.slot}`),
	)}.`
}
