import { describe, expect, it } from "vitest"
import { espnDatesBetween } from "./espn-client"

describe("espnDatesBetween", () => {
	it("lists every day from start through end", () => {
		expect(espnDatesBetween("20260930", "20261002")).toEqual([
			"20260930",
			"20261001",
			"20261002",
		])
	})

	it("is the one day for a range that starts and ends on it", () => {
		expect(espnDatesBetween("20261002", "20261002")).toEqual(["20261002"])
	})
})
