import { describe, expect, it } from "vitest"
import {
	LOSS_QUIPS,
	NARROW_MISS_QUIPS,
	type QuipTone,
	quipForCall,
	RUNAWAY_WIN_QUIPS,
	WIN_QUIPS,
} from "./index"

const TONES: QuipTone[] = ["win", "loss", "narrow_miss", "runaway_win"]

const POOLS: Record<QuipTone, readonly string[]> = {
	win: WIN_QUIPS,
	loss: LOSS_QUIPS,
	narrow_miss: NARROW_MISS_QUIPS,
	runaway_win: RUNAWAY_WIN_QUIPS,
}

const ID = "eed9014b-0694-4b1c-9bae-00c8e327efa1"

describe("quipForCall", () => {
	// The whole reason the picker is a hash and not Math.random: the call page
	// and the api's exported PNG each derive the line independently, and a
	// reader who reopens a card they already shared has to see the same joke.
	it("returns the same line for the same call and tone every time", () => {
		for (const tone of TONES) {
			const first = quipForCall(ID, tone)
			expect(quipForCall(ID, tone)).toBe(first)
			expect(quipForCall(ID, tone)).toBe(first)
		}
	})

	it("draws only from the pool its tone names", () => {
		for (const tone of TONES) {
			expect(POOLS[tone]).toContain(quipForCall(ID, tone))
		}
	})

	it("spreads different calls across a pool rather than piling onto one line", () => {
		const drawn = new Set(
			Array.from({ length: 200 }, (_, i) => quipForCall(`call-${i}`, "win")),
		)
		expect(drawn.size).toBeGreaterThan(WIN_QUIPS.length / 2)
	})
})

describe("quip pools", () => {
	// A pool with a duplicate quietly weights that line, and the card's own
	// labels showing up here would say the same thing twice a few pixels apart.
	const CARD_LABELS = ["Inches away", "By a hair", "Never in doubt", "Not close"]

	it("has no repeated lines within or across pools", () => {
		const all = TONES.flatMap((tone) => [...POOLS[tone]])
		expect(new Set(all).size).toBe(all.length)
	})

	it("never reuses one of the card's own result labels", () => {
		for (const tone of TONES) {
			for (const quip of POOLS[tone]) {
				expect(CARD_LABELS).not.toContain(quip)
			}
		}
	})

	it("keeps every pool non-empty so a tone can't draw undefined", () => {
		for (const tone of TONES) {
			expect(POOLS[tone].length).toBeGreaterThan(0)
		}
	})
})
