import { describe, expect, it } from "vitest"
import { buildGameTweet } from "./game-share-row"

const base = { matchup: "NYJ @ BUF", questionCount: 12 }

describe("buildGameTweet", () => {
	it("states only the called count until a question settles", () => {
		expect(
			buildGameTweet({
				...base,
				calledCount: 5,
				wins: 0,
				losses: 0,
				points: 0,
				isOwn: true,
			}),
		).toBe("My NYJ @ BUF picks: 5 of 12 called.")
	})

	it("adds the record and signed points once something has settled", () => {
		expect(
			buildGameTweet({
				...base,
				calledCount: 5,
				wins: 3,
				losses: 1,
				points: -12,
				isOwn: true,
			}),
		).toBe("My NYJ @ BUF picks: 3–1, −12 pts.")
	})

	it("attributes someone else's picks to them, never to the sharer", () => {
		expect(
			buildGameTweet({
				...base,
				calledCount: 5,
				wins: 0,
				losses: 0,
				points: 0,
				isOwn: false,
				username: "quinn",
			}),
		).toBe("@quinn's NYJ @ BUF picks: 5 of 12 called.")
	})
})
