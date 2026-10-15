import { describe, expect, it } from "vitest"
import { cardFactParts } from "./card-fact"

describe("cardFactParts", () => {
	it("marks the figures apart from the words", () => {
		expect(
			cardFactParts({
				kind: "LINE_HITS",
				statLabel: "Points",
				line: 24.5,
				sides: [{ label: "Jayson Tatum", games: 10, hits: 7, mean: 26.1 }],
			}),
		).toEqual([
			"Over ",
			{ figure: "24.5" },
			" in ",
			{ figure: "7" },
			" of last 10 games",
		])
	})
})
