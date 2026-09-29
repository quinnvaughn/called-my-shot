import { describe, expect, it } from "vitest"
import { buildProfileTweet, profileCardVersion } from "./profile"

const facts = {
	username: "quinn",
	totalPoints: 2797,
	rank: 1,
	accuracy: 59.6,
}

describe("buildProfileTweet", () => {
	it("speaks in the first person on your own profile", () => {
		expect(buildProfileTweet({ ...facts, isOwn: true })).toBe(
			"My track record on Called My Shot: 2,797 points, 60% accuracy, ranked #1.",
		)
	})

	it("names the caller on someone else's", () => {
		expect(buildProfileTweet({ ...facts, isOwn: false })).toBe(
			"@quinn's track record on Called My Shot: 2,797 points, 60% accuracy, ranked #1.",
		)
	})

	it("leaves out what isn't known yet", () => {
		expect(
			buildProfileTweet({ ...facts, rank: null, accuracy: null, isOwn: true }),
		).toBe("My track record on Called My Shot: 2,797 points.")
	})
})

describe("profileCardVersion", () => {
	it("moves when any number on the card does", () => {
		const base = { totalPoints: 100, resolvedCallCount: 4, rank: 3 }
		const v = profileCardVersion(base)
		expect(profileCardVersion({ ...base, totalPoints: 110 })).not.toBe(v)
		expect(profileCardVersion({ ...base, resolvedCallCount: 5 })).not.toBe(v)
		expect(profileCardVersion({ ...base, rank: null })).not.toBe(v)
	})
})
