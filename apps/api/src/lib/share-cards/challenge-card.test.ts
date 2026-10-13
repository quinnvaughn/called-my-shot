import { describe, expect, it } from "vitest"
import { textNodes } from "../../test/helpers"
import { buildChallengeCard, buildMatchupCard } from "./challenge-card"

const challenge = {
	creatorName: "Quinn Vaughn",
	creatorUsername: "quinn",
	state: "open" as const,
	questionCount: 6,
	acceptanceCount: 3,
	tally: { wins: 0, losses: 0, draws: 0 },
	rows: [
		{ title: "Jokic over 27.5 points", pick: "Over 27.5" },
		{ title: "Nuggets win", pick: null },
		{ title: "Q3", pick: "Yes" },
		{ title: "Q4", pick: "No" },
		{ title: "Q5", pick: "No" },
		{ title: "Q6", pick: "No" },
	],
}

describe("buildChallengeCard", () => {
	it("shows the creator's calls while it's open, and how many are left over", () => {
		const texts = textNodes(buildChallengeCard(challenge))
		expect(texts).toContain("@quinn's calls")
		expect(texts).toContain("Over 27.5")
		expect(texts).toContain("No call yet")
		expect(texts).toContain("+2 more")
		expect(texts).toContain("Open")
		expect(texts).not.toContain("Record")
	})

	it("shows the creator's record against the field once settled", () => {
		const texts = textNodes(
			buildChallengeCard({
				...challenge,
				state: "settled",
				tally: { wins: 2, losses: 1, draws: 0 },
			}),
		)
		expect(texts).toContain("Record")
		expect(texts).toContain("2-1")
	})
})

describe("buildMatchupCard", () => {
	it("names the winner and both totals", () => {
		const texts = textNodes(
			buildMatchupCard({
				creatorUsername: "quinn",
				acceptorUsername: "sam",
				creatorPoints: 120,
				acceptorPoints: -40,
				outcome: "creator",
				questionCount: 3,
			}),
		)
		expect(texts).toContain("+120")
		expect(texts).toContain("-40")
		expect(texts).toContain("@quinn won")
		expect(texts).toContain("@quinn vs @sam")
	})
})
