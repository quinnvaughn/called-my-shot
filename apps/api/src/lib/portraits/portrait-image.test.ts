import sharp from "sharp"
import { describe, expect, it } from "vitest"
import {
	CUTOUT_SHARE,
	headAndShouldersCrop,
	PORTRAIT_SIZE,
	preparePortrait,
	transparentShare,
} from "./portrait-image"
import { cutoutPng, opaquePng } from "./test-images"

describe("transparentShare", () => {
	it("tells a cutout from a photo with its background in", async () => {
		expect(await transparentShare(await cutoutPng())).toBeGreaterThan(
			CUTOUT_SHARE,
		)
		expect(await transparentShare(await opaquePng())).toBe(0)
	})
})

describe("headAndShouldersCrop", () => {
	it("frames a square from just above the crown, centred on the head", () => {
		// A 20px-wide head from row 10, on a figure 100px wide and 200 tall.
		const width = 200
		const height = 300
		const alpha = new Uint8Array(width * height)
		for (let y = 10; y < 210; y++) {
			const half = y < 40 ? 10 : 50
			for (let x = 100 - half; x < 100 + half; x++) alpha[y * width + x] = 255
		}
		const crop = headAndShouldersCrop(alpha, width, height)
		expect(crop).not.toBeNull()
		if (!crop) return
		expect(crop.top).toBeLessThan(10)
		expect(crop.left + crop.width / 2).toBeCloseTo(100, -1)
		// A couple of head widths, not the whole figure.
		expect(crop.height).toBeLessThan(100)
		expect(crop.width).toBe(crop.height)
	})

	it("finds nothing in an empty mask", () => {
		expect(headAndShouldersCrop(new Uint8Array(100), 10, 10)).toBeNull()
	})
})

describe("preparePortrait", () => {
	it("crops a cutout to a square PNG that keeps its transparency", async () => {
		const png = await preparePortrait(await cutoutPng(1040, 760), true)
		expect(png).not.toBeNull()
		const meta = await sharp(png as Buffer).metadata()
		expect(meta).toMatchObject({
			format: "png",
			width: PORTRAIT_SIZE,
			height: PORTRAIT_SIZE,
			channels: 4,
		})
		expect(await transparentShare(png as Buffer)).toBeGreaterThan(CUTOUT_SHARE)
	})

	it("squares a photo with its background in and keeps its colors", async () => {
		const png = await preparePortrait(await opaquePng(260, 380), false)
		const meta = await sharp(png as Buffer).metadata()
		expect(meta).toMatchObject({ width: PORTRAIT_SIZE, height: PORTRAIT_SIZE })
		const { channels } = await sharp(png as Buffer).stats()
		const [r, , b] = channels.map((channel) => channel.mean)
		// The test photo's blue background stays blue.
		expect(b).toBeGreaterThan(r as number)
	})

	it("is deterministic, so a rebuild lands on the same key", async () => {
		const image = await cutoutPng()
		const [a, b] = await Promise.all([
			preparePortrait(image, true),
			preparePortrait(image, true),
		])
		expect(a?.equals(b as Buffer)).toBe(true)
	})
})
