import { describe, expect, it } from "vitest"
import { textNodes } from "../../test/helpers"
import { buildGameShareCard } from "./game-card"

const base = {
	leagueAbbr: "NFL",
	awayAbbr: "NYJ",
	homeAbbr: "BUF",
	name: "Quinn Vaughn",
	username: "quinn",
	calledCount: 5,
	questionCount: 12,
	wins: 0,
	losses: 0,
	points: 0,
	pendingLabel: "Locks Sep 14, 2026",
}

describe("buildGameShareCard", () => {
	it("shows the called count and when the slate locks before anything settles", () => {
		const texts = textNodes(buildGameShareCard(base))
		expect(texts).toContain("NFL · Game")
		expect(texts).toContain("Quinn Vaughn's picks")
		expect(texts).toContain("NYJ @ BUF")
		expect(texts).toContain("5 of 12")
		expect(texts).toContain("Locks Sep 14, 2026")
		expect(texts).not.toContain("Record")
		expect(texts).toContain("@quinn")
	})

	it("swaps the status for a record and signed points once something settles", () => {
		const texts = textNodes(
			buildGameShareCard({ ...base, wins: 3, losses: 1, points: -12 }),
		)
		expect(texts).toContain("3–1")
		expect(texts).toContain("−12")
		expect(texts).not.toContain("Locks Sep 14, 2026")
	})
})
