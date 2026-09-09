import { describe, expect, it } from "vitest"
import { buildCallTweet } from "./call-share-row"

const base = {
	pickLabel: "Over 275.5",
	calledAt: "Mar 3, 2026",
}

describe("buildCallTweet", () => {
	it("speaks in the first person about your own call", () => {
		expect(
			buildCallTweet({ ...base, points: 240, isWin: true, isOwn: true }),
		).toBe("Called it: Over 275.5. +240 pts.")
		expect(
			buildCallTweet({ ...base, points: -80, isWin: false, isOwn: true }),
		).toBe("I called Over 275.5. Didn't happen. −80 pts.")
		expect(
			buildCallTweet({ ...base, points: null, isWin: null, isOwn: true }),
		).toBe("On the record: Over 275.5. Called Mar 3, 2026.")
	})

	// A call page is public and anyone can share anyone's. First-person text on
	// someone else's record would put the sharer on X claiming a call they
	// didn't make.
	it("attributes someone else's call to them, never to the sharer", () => {
		for (const outcome of [
			{ points: 240, isWin: true },
			{ points: -80, isWin: false },
			{ points: null, isWin: null },
		]) {
			const tweet = buildCallTweet({
				...base,
				...outcome,
				isOwn: false,
				username: "quinn",
			})
			expect(tweet).toContain("@quinn")
			expect(tweet).not.toMatch(/\bI called\b/)
			expect(tweet).not.toMatch(/^Called it:/)
			expect(tweet).not.toMatch(/^On the record:/)
		}
	})
})
