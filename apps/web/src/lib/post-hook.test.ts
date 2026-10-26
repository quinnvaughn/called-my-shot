import { describe, expect, it } from "vitest"
import { redraftHook, rushmoreHook } from "./post-hook"

const face = (name: string, sharePercent: number) => ({
	sharePercent,
	player: { name },
})

describe("rushmoreHook", () => {
	const picks = [
		face("Larry Bird", 92),
		face("Bill Russell", 88),
		face("Paul Pierce", 14),
		face("Kevin Garnett", 9),
	]

	it("names the pick the fewest people made", () => {
		expect(rushmoreHook(picks, 40)).toBe(
			"Only 9% of people put Kevin Garnett on theirs.",
		)
	})

	it("says nothing while too few people have answered", () => {
		expect(rushmoreHook(picks, 9)).toBeNull()
	})

	it("says nothing when every pick is a popular one", () => {
		expect(
			rushmoreHook([face("Larry Bird", 92), face("Paul Pierce", 40)], 40),
		).toBeNull()
	})

	it("reads a rounded-down 0 as fewer than 1%", () => {
		expect(rushmoreHook([face("Dino Radja", 0)], 300)).toBe(
			"Fewer than 1% of people put Dino Radja on theirs.",
		)
	})
})

describe("redraftHook", () => {
	it("names the slot alongside the pick", () => {
		expect(
			redraftHook(
				[
					{ slot: 1, ...face("LeBron James", 97) },
					{ slot: 2, ...face("Chris Bosh", 11) },
				],
				25,
			),
		).toBe("Only 11% take Chris Bosh at No. 2.")
	})
})
