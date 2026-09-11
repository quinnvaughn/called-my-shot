import { describe, expect, it } from "vitest"
import { buildBallotTweet } from "./ballot-share-row"

const base = { ballotName: "Major Awards", memberCount: 6 }

describe("buildBallotTweet", () => {
	it("states only the called count until a member settles", () => {
		expect(
			buildBallotTweet({
				...base,
				calledCount: 4,
				wins: 0,
				losses: 0,
				points: 0,
				isOwn: true,
			}),
		).toBe("My Major Awards ballot: 4 of 6 called.")
	})

	it("adds the record and points once something has settled", () => {
		expect(
			buildBallotTweet({
				...base,
				calledCount: 6,
				wins: 3,
				losses: 1,
				points: 240,
				isOwn: true,
			}),
		).toBe("My Major Awards ballot: 3–1, +240 pts.")
		expect(
			buildBallotTweet({
				...base,
				calledCount: 6,
				wins: 1,
				losses: 3,
				points: -80,
				isOwn: true,
			}),
		).toBe("My Major Awards ballot: 1–3, −80 pts.")
	})

	it("attributes someone else's ballot to them, never to the sharer", () => {
		const tweet = buildBallotTweet({
			...base,
			calledCount: 4,
			wins: 0,
			losses: 0,
			points: 0,
			isOwn: false,
			username: "quinn",
		})
		expect(tweet).toBe("@quinn's Major Awards ballot: 4 of 6 called.")
		expect(tweet).not.toMatch(/^My /)
	})
})
