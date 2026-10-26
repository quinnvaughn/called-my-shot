import { describe, expect, it } from "vitest"
import { sharedSlotsLine } from "./shared-slots"

const pick = (slot: number, id: string, name = `Player ${id}`) => ({
	slot,
	player: { id, name },
})
const theirs = [
	pick(1, "lebron", "LeBron James"),
	pick(2, "wade", "Dwyane Wade"),
	pick(3, "melo", "Carmelo Anthony"),
	pick(4, "bosh", "Chris Bosh"),
	pick(5, "west", "David West"),
]

describe("sharedSlotsLine", () => {
	it("names the players both put in the same slot", () => {
		expect(
			sharedSlotsLine(theirs, [
				pick(1, "melo"),
				pick(2, "wade"),
				pick(3, "lebron"),
				pick(4, "bosh"),
				pick(5, "kaman"),
			]),
		).toBe("You both took Wade at 2 and Bosh at 4.")
	})

	it("only compares the slots both reach", () => {
		expect(sharedSlotsLine(theirs, theirs.slice(0, 3))).toBe(
			"Your first 3 match theirs, slot for slot.",
		)
		expect(sharedSlotsLine(theirs, theirs)).toBe(
			"Same as yours, slot for slot.",
		)
	})

	it("counts a long run of matches and says when there are none", () => {
		const twelve = Array.from({ length: 12 }, (_, i) => pick(i + 1, `p${i}`))
		const mine = twelve.map((p, i) => (i < 6 ? p : pick(p.slot, `x${i}`)))
		expect(sharedSlotsLine(twelve, mine)).toBe(
			"You both put the same player in 6 slots.",
		)
		expect(sharedSlotsLine(theirs, [pick(1, "wade")])).toBe(
			"None of your picks are in the same slot.",
		)
	})
})
