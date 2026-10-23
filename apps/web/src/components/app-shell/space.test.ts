import { describe, expect, it } from "vitest"
import { resolveSpace } from "./space"
import type { League } from "./types"

const nfl: League = {
	id: "1",
	name: "National Football League",
	abbreviation: "NFL",
	slug: "nfl",
}
const leagues = [nfl]

describe("resolveSpace", () => {
	it("puts Home and the unfiltered leaderboard in the home space", () => {
		expect(resolveSpace("/home", null, leagues)).toEqual({ kind: "home" })
		expect(resolveSpace("/leaderboard", null, leagues)).toEqual({
			kind: "home",
		})
	})

	it("treats a leaderboard filtered to a league as that league's", () => {
		expect(resolveSpace("/leaderboard", "nfl", leagues)).toEqual({
			kind: "league",
			league: nfl,
		})
		expect(resolveSpace("/leaderboard", "xfl", leagues)).toEqual({
			kind: "home",
		})
	})

	it("groups the viewer's own pages under you", () => {
		for (const path of [
			"/my-calls",
			"/my-questions",
			"/challenges",
			"/challenges/new",
		]) {
			expect(resolveSpace(path, null, leagues)).toEqual({ kind: "you" })
		}
	})

	it("keeps a single challenge out of you", () => {
		expect(resolveSpace("/challenges/abc123", null, leagues)).toEqual({
			kind: "elsewhere",
		})
	})

	it("resolves the arcade and its games", () => {
		expect(resolveSpace("/arcade", null, leagues)).toEqual({ kind: "arcade" })
		expect(resolveSpace("/arcade/blind-rank/", null, leagues)).toEqual({
			kind: "arcade",
		})
	})

	it("resolves a league by slug, and an unknown slug to elsewhere", () => {
		expect(resolveSpace("/leagues/nfl/season", null, leagues)).toEqual({
			kind: "league",
			league: nfl,
		})
		expect(resolveSpace("/leagues/xfl", null, leagues)).toEqual({
			kind: "elsewhere",
		})
	})

	it("resolves a group and its sub-pages, but not the invite landing", () => {
		expect(resolveSpace("/groups/g1", null, leagues)).toEqual({
			kind: "group",
			groupId: "g1",
		})
		expect(resolveSpace("/groups/g1/chains/c1", null, leagues)).toEqual({
			kind: "group",
			groupId: "g1",
		})
		expect(resolveSpace("/groups/join/abc", null, leagues)).toEqual({
			kind: "elsewhere",
		})
	})

	it("sends everything else elsewhere", () => {
		expect(resolveSpace("/questions/q1", null, leagues)).toEqual({
			kind: "elsewhere",
		})
		expect(resolveSpace("/spaces", null, leagues)).toEqual({ kind: "spaces" })
	})
})
