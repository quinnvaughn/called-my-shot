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
	gameLabel: "DEN @ LAL",
	titles: ["Jokic over 27.5 points", "Who will win?", "Q3", "Q4", "Q5", "Q6"],
}

describe("buildChallengeCard", () => {
	it("leads with the dare, the questions a line under it", () => {
		const texts = textNodes(buildChallengeCard(challenge))
		expect(texts).toContain("Can you beat @quinn?")
		expect(texts).toContain("6 questions on DEN @ LAL")
		expect(texts).toContain("Jokic over 27.5 points · Who will win? · +4 more")
		expect(texts).toContain("Open")
		expect(texts).not.toContain("Record")
	})

	it("stays a dare once it's closed", () => {
		const texts = textNodes(buildChallengeCard({ ...challenge, state: "live" }))
		expect(texts).toContain("Can you beat @quinn?")
		expect(texts).toContain("Playing")
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
