import { describe, expect, it } from "vitest"
import { profileCardVersion } from "./profile"

describe("profileCardVersion", () => {
	it("moves when any number on the card does", () => {
		const base = { totalPoints: 100, resolvedCallCount: 4, rank: 3 }
		const v = profileCardVersion(base)
		expect(profileCardVersion({ ...base, totalPoints: 110 })).not.toBe(v)
		expect(profileCardVersion({ ...base, resolvedCallCount: 5 })).not.toBe(v)
		expect(profileCardVersion({ ...base, rank: null })).not.toBe(v)
	})
})
