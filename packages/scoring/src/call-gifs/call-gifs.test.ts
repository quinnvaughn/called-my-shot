import { describe, expect, it } from "vitest"
import {
	type CallGifState,
	GIF_POOLS,
	pickCallGif,
	pickGif,
} from "./index"
import { JOIN_GIFS } from "../join-gifs"

const STATES: CallGifState[] = [
	"voided",
	"pending",
	"nailed",
	"should_have_stuck",
	"never_in_doubt",
	"by_a_hair",
	"called_it",
	"inches_away",
	"way_off",
	"missed",
]

describe("GIF_POOLS", () => {
	it("has a pool for every state", () => {
		for (const state of STATES) {
			expect(GIF_POOLS[state]).toBeDefined()
		}
		expect(Object.keys(GIF_POOLS).sort()).toEqual([...STATES].sort())
	})

	// A duplicate url quietly weights that gif, and one appearing under two
	// states means the same reaction answers two different results. The join
	// pool is included so a call reaction never turns up on an invite.
	it("has no repeated url within or across pools", () => {
		const urls = [
			...STATES.flatMap((state) => GIF_POOLS[state].map((g) => g.url)),
			...JOIN_GIFS.map((g) => g.url),
		]
		expect(new Set(urls).size).toBe(urls.length)
	})

	it("hotlinks the asset rather than the page it sits on", () => {
		for (const state of STATES) {
			for (const gif of GIF_POOLS[state]) {
				expect(gif.url).toMatch(/^https:\/\//)
				expect(gif.url).not.toMatch(/^https:\/\/(www\.)?(giphy|tenor)\.com\//)
			}
		}
	})

	it("describes every gif, since a bare cdn url names nothing", () => {
		for (const state of STATES) {
			for (const gif of GIF_POOLS[state]) {
				expect(gif.alt.trim()).not.toBe("")
			}
		}
	})

	// The label sits a few pixels above the gif. An alt repeating it reads as
	// a stutter to the one reader who gets both.
	it("never reuses one of the card's own result labels as alt text", () => {
		const CARD_LABELS = [
			"Inches away",
			"By a hair",
			"Never in doubt",
			"Not close",
		]
		for (const state of STATES) {
			for (const gif of GIF_POOLS[state]) {
				expect(CARD_LABELS).not.toContain(gif.alt)
			}
		}
	})
})

describe("JOIN_GIFS", () => {
	it("hotlinks described assets, same as the call pools", () => {
		for (const gif of JOIN_GIFS) {
			expect(gif.url).toMatch(/^https:\/\//)
			expect(gif.url).not.toMatch(/^https:\/\/(www\.)?(giphy|tenor)\.com\//)
			expect(gif.alt.trim()).not.toBe("")
		}
	})
})

describe("pickGif", () => {
	it("returns null for an empty pool", () => {
		expect(pickGif([])).toBeNull()
	})

	it("draws only from the pool it's given", () => {
		const pool = [
			{ url: "https://cdn/a.gif", alt: "a" },
			{ url: "https://cdn/b.gif", alt: "b" },
		]
		for (let i = 0; i < 50; i++) {
			expect(pool).toContain(pickGif(pool))
		}
	})
})

describe("pickCallGif", () => {
	// A state with nothing to say says nothing, rather than borrowing a
	// neighbouring pool's reaction to the wrong result.
	it("returns null for an empty pool", () => {
		for (const state of STATES) {
			if (GIF_POOLS[state].length === 0) {
				expect(pickCallGif(state)).toBeNull()
			}
		}
	})

	it("draws only from the pool its state names", () => {
		for (const state of STATES) {
			const pool = GIF_POOLS[state]
			if (pool.length === 0) continue
			for (let i = 0; i < 50; i++) {
				expect(pool).toContain(pickCallGif(state))
			}
		}
	})
})
