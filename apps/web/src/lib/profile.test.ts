import { describe, expect, it } from "vitest"
import { profileCardVersion, scopedLeague } from "./profile"

describe("profileCardVersion", () => {
	it("moves when any number on the card does", () => {
		const base = { totalPoints: 100, resolvedCallCount: 4, rank: 3 }
		const v = profileCardVersion(base)
		expect(profileCardVersion({ ...base, totalPoints: 110 })).not.toBe(v)
		expect(profileCardVersion({ ...base, resolvedCallCount: 5 })).not.toBe(v)
		expect(profileCardVersion({ ...base, rank: null })).not.toBe(v)
	})
})

describe("scopedLeague", () => {
	const row = (slug: string) => ({
		league: { id: slug, name: slug, abbreviation: slug, slug },
	})
	const leagues = [row("nfl"), row("nba")]

	it("finds the league the slug names", () => {
		expect(scopedLeague(leagues, "nba")).toBe(leagues[1])
	})

	it("falls back to the whole career without a slug or for one never played", () => {
		expect(scopedLeague(leagues, undefined)).toBeNull()
		expect(scopedLeague(leagues, "mlb")).toBeNull()
	})
})
