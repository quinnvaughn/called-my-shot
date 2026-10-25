import { describe, expect, it } from "vitest"
import { resolveSpace, spaceOfPage } from "./space"
import type { League } from "./types"

const nfl: League = {
	id: "1",
	name: "National Football League",
	abbreviation: "NFL",
	slug: "nfl",
}
const leagues = [nfl]

describe("spaceOfPage", () => {
	it("turns a page's named space into the space it lights", () => {
		expect(spaceOfPage({ kind: "league", leagueId: "1" }, leagues)).toEqual({
			kind: "league",
			league: nfl,
		})
		expect(
			spaceOfPage({ kind: "team", leagueId: "1", teamSlug: "ne" }, leagues),
		).toEqual({ kind: "team", league: nfl, teamSlug: "ne" })
		expect(spaceOfPage({ kind: "group", groupId: "g" }, leagues)).toEqual({
			kind: "group",
			groupId: "g",
		})
	})

	it("gives nothing for a league that isn't listed", () => {
		expect(spaceOfPage({ kind: "league", leagueId: "9" }, leagues)).toBeNull()
	})
})

describe("resolveSpace", () => {
	it("puts Home and the unfiltered leaderboard in the home space", () => {
		expect(resolveSpace("/", null, leagues, null)).toEqual({ kind: "home" })
		expect(resolveSpace("/leaderboard", null, leagues, null)).toEqual({
			kind: "home",
		})
	})

	it("treats a leaderboard filtered to a league as that league's", () => {
		expect(resolveSpace("/leaderboard", "nfl", leagues, null)).toEqual({
			kind: "league",
			league: nfl,
		})
		expect(resolveSpace("/leaderboard", "xfl", leagues, null)).toEqual({
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
			expect(resolveSpace(path, null, leagues, null)).toEqual({ kind: "you" })
		}
	})

	it("keeps a single challenge out of you", () => {
		expect(resolveSpace("/challenges/abc123", null, leagues, null)).toEqual({
			kind: "elsewhere",
		})
	})

	it("resolves the arcade and its games", () => {
		expect(resolveSpace("/arcade", null, leagues, null)).toEqual({
			kind: "arcade",
		})
		expect(resolveSpace("/arcade/blind-rank/", null, leagues, null)).toEqual({
			kind: "arcade",
		})
	})

	it("resolves a league by slug, and an unknown slug to elsewhere", () => {
		expect(resolveSpace("/leagues/nfl/season", null, leagues, null)).toEqual({
			kind: "league",
			league: nfl,
		})
		expect(resolveSpace("/leagues/xfl", null, leagues, null)).toEqual({
			kind: "elsewhere",
		})
	})

	it("resolves a team inside its league, and an unknown league to elsewhere", () => {
		expect(resolveSpace("/leagues/nfl/teams/kc", null, leagues, null)).toEqual({
			kind: "team",
			league: nfl,
			teamSlug: "kc",
		})
		expect(resolveSpace("/leagues/xfl/teams/kc", null, leagues, null)).toEqual({
			kind: "elsewhere",
		})
		expect(resolveSpace("/leagues/nfl/teams", null, leagues, null)).toEqual({
			kind: "league",
			league: nfl,
		})
	})

	it("puts the viewer's own profile under you, and anyone else's elsewhere", () => {
		const me = { username: "Quinn" }
		expect(resolveSpace("/user/quinn", null, leagues, me)).toEqual({
			kind: "you",
		})
		expect(resolveSpace("/user/someone", null, leagues, me)).toEqual({
			kind: "elsewhere",
		})
		expect(resolveSpace("/user/quinn", null, leagues, null)).toEqual({
			kind: "elsewhere",
		})
		expect(
			resolveSpace("/user/quinn/streaks/nfl/winner/hot", null, leagues, me),
		).toEqual({ kind: "elsewhere" })
	})

	it("resolves a group and its sub-pages, but not the invite landing", () => {
		expect(resolveSpace("/groups/g1", null, leagues, null)).toEqual({
			kind: "group",
			groupId: "g1",
		})
		expect(resolveSpace("/groups/g1/chains/c1", null, leagues, null)).toEqual({
			kind: "group",
			groupId: "g1",
		})
		expect(resolveSpace("/groups/join/abc", null, leagues, null)).toEqual({
			kind: "elsewhere",
		})
	})

	it("sends everything else elsewhere", () => {
		expect(resolveSpace("/questions/q1", null, leagues, null)).toEqual({
			kind: "elsewhere",
		})
		expect(resolveSpace("/spaces", null, leagues, null)).toEqual({
			kind: "spaces",
		})
	})
})
