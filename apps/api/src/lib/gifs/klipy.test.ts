import { describe, expect, it } from "vitest"
import { allowGifSearch, normalizeKlipyItem } from "./klipy"

const file = (url: string, width = 200, height = 150) => ({
	gif: { url, width, height },
})

describe("normalizeKlipyItem", () => {
	it("takes the medium GIF to send and the small one to preview", () => {
		expect(
			normalizeKlipyItem({
				id: 7,
				slug: "dunk",
				title: " Big dunk ",
				file: {
					hd: file("hd.gif", 600, 450),
					md: file("md.gif", 400, 300),
					sm: file("sm.gif"),
				},
			}),
		).toEqual({
			id: "dunk",
			url: "md.gif",
			previewUrl: "sm.gif",
			width: 400,
			height: 300,
			alt: "Big dunk",
		})
	})

	it("falls back to whatever sizes there are, and skips an item with none", () => {
		expect(
			normalizeKlipyItem({ id: 9, file: { xs: file("xs.gif") } }),
		).toMatchObject({ id: "9", url: "xs.gif", previewUrl: "xs.gif" })
		expect(normalizeKlipyItem({ id: 9, file: {} })).toBeNull()
	})
})

describe("allowGifSearch", () => {
	it("caps searches per person per minute", () => {
		const now = 1_000_000
		for (let i = 0; i < 60; i++) {
			expect(allowGifSearch("someone", now + i)).toBe(true)
		}
		expect(allowGifSearch("someone", now + 61)).toBe(false)
		expect(allowGifSearch("someone else", now + 61)).toBe(true)
		expect(allowGifSearch("someone", now + 60_001)).toBe(true)
	})
})
