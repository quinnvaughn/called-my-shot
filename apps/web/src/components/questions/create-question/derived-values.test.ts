import { describe, expect, it } from "vitest"
import { canSubmitWith, toPoolOptions } from "./derived-values"
import type { CreateQuestionValues } from "./form-context"
import { DEFAULT_VALUES } from "./test-utils"

const SPORT_ID = "00000000-0000-4000-8000-000000000001"
const LEAGUE_ID = "00000000-0000-4000-8000-000000000002"

// A yes/no prop with everything filled in but the title, which is where the
// form stores nothing until the creator types.
const yesNo: CreateQuestionValues = {
	...DEFAULT_VALUES,
	shape: "yes_no_prop",
	sportId: SPORT_ID,
	leagueId: LEAGUE_ID,
	locksAt: "2099-01-01T12:00",
	eventClause: "signs an extension",
}

const award: CreateQuestionValues = {
	...DEFAULT_VALUES,
	shape: "player_season_award",
	title: "Who will win MVP?",
	sportId: SPORT_ID,
	leagueId: LEAGUE_ID,
	locksAt: "2099-01-01T12:00",
	isOfficial: true,
	awardName: "MVP",
	awardVerb: "win",
	picksRequired: 1,
}

const pool = toPoolOptions([
	{ id: "00000000-0000-4000-8000-00000000000a", label: "A", kind: "player" },
	{ id: "00000000-0000-4000-8000-00000000000b", label: "B", kind: "player" },
])

describe("canSubmitWith", () => {
	it("judges the generated title, not the empty stored one", () => {
		expect(
			canSubmitWith(
				{ values: yesNo, errors: { title: "Give it a title" } },
				{ title: "Will he sign an extension?" },
			),
		).toBe(true)
	})

	it("blocks on an empty title once the creator has cleared it", () => {
		expect(
			canSubmitWith(
				{ values: yesNo, errors: { title: "Give it a title" } },
				{ title: "" },
			),
		).toBe(false)
	})

	it("still blocks on an error standing on a typed field", () => {
		expect(
			canSubmitWith(
				{ values: yesNo, errors: { eventClause: "Rejected by the server" } },
				{ title: "Will he sign an extension?" },
			),
		).toBe(false)
	})

	it("judges a pool shape by the pool it will submit", () => {
		const errors = { options: "Pool must have at least 1 players" }
		expect(
			canSubmitWith(
				{ values: award, errors },
				{ title: award.title, options: pool },
			),
		).toBe(true)
		expect(
			canSubmitWith(
				{ values: award, errors },
				{ title: award.title, options: [] },
			),
		).toBe(false)
	})
})

describe("toPoolOptions", () => {
	it("carries each item's id on the side that matches its kind", () => {
		expect(
			toPoolOptions([
				{ id: "p", label: "Player", kind: "player" },
				{ id: "t", label: "Team", kind: "team" },
			]),
		).toEqual([
			{ label: "Player", teamId: undefined, playerId: "p" },
			{ label: "Team", teamId: "t", playerId: undefined },
		])
	})
})
