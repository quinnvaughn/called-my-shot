import { describe, expect, it } from "vitest"
import {
	AuthenticationError,
	AuthorizationError,
	ValidationError,
} from "./errors"
import { typicalGameLengthHours } from "./game-length"
import { accuracyFrom, compareRankableEntries, scoreCalls } from "./scoring"
import { compareTeamsByGrouping, teamSectionResolver } from "./team-grouping"
import { addLeagueStatDelta, type LeagueStatDelta } from "./user-season-stats"
import { isUuid } from "./uuid"

describe("isUuid", () => {
	it("accepts a real uuid in either case", () => {
		expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true)
		expect(isUuid("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(true)
	})

	it("rejects anything Postgres would throw on", () => {
		// A uuid column errors rather than just not matching, so these have to
		// be caught before they reach the DB.
		expect(isUuid("")).toBe(false)
		expect(isUuid("not-a-uuid")).toBe(false)
		expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c330")).toBe(false)
		expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301x")).toBe(false)
		expect(isUuid("'; drop table users; --")).toBe(false)
	})
})

describe("typicalGameLengthHours", () => {
	it("knows the leagues it has been tuned for", () => {
		expect(typicalGameLengthHours("nba")).toBe(2.5)
		expect(typicalGameLengthHours("nfl")).toBe(3.5)
		expect(typicalGameLengthHours("mlb")).toBe(3.25)
	})

	it("falls back for a league it hasn't seen", () => {
		expect(typicalGameLengthHours("nhl")).toBe(3)
		expect(typicalGameLengthHours("")).toBe(3)
	})
})

describe("ValidationError", () => {
	it("surfaces the first message as the error message", () => {
		const error = new ValidationError([
			{ field: "a", message: "First problem" },
			{ field: "b", message: "Second problem" },
		])
		expect(error.message).toBe("First problem")
		expect(error.name).toBe("ValidationError")
	})

	it("falls back to a generic message with no field errors", () => {
		expect(new ValidationError([]).message).toBe("Validation failed")
	})

	it("builds a single-field error", () => {
		expect(ValidationError.field("ouLine", "Set the line").fieldErrors).toEqual(
			[{ field: "ouLine", message: "Set the line" }],
		)
	})

	it("flattens a zod path into a dotted field name", () => {
		const error = ValidationError.fromZodIssues([
			{ path: ["options", 1, "label"], message: "Pick a real player" },
			{ path: [], message: "Whole-form problem" },
		])
		expect(error.fieldErrors).toEqual([
			{ field: "options.1.label", message: "Pick a real player" },
			{ field: null, message: "Whole-form problem" },
		])
	})

	it("gives the auth errors their default messages and names", () => {
		expect(new AuthenticationError().message).toBe("You must be signed in.")
		expect(new AuthenticationError().name).toBe("AuthenticationError")
		expect(new AuthorizationError().name).toBe("AuthorizationError")
		expect(new AuthorizationError("Admins only.").message).toBe("Admins only.")
	})
})

describe("scoreCalls", () => {
	const selection = (
		resultPoints: number | null,
		isCorrect: boolean | null,
	) => ({
		resultPoints,
		option: { isCorrect },
	})

	it("scores an option-based call through its selections", () => {
		expect(
			scoreCalls([
				{
					resultPoints: null,
					hitTolerance: null,
					selections: [selection(100, true), selection(-50, false)],
				},
			]),
		).toEqual({ totalPoints: 50, resolvedCallCount: 2, correctCount: 1 })
	})

	it("counts picks, not calls, on a multi-pick award", () => {
		const summary = scoreCalls([
			{
				resultPoints: null,
				hitTolerance: null,
				selections: [
					selection(10, true),
					selection(10, true),
					selection(10, true),
				],
			},
		])
		expect(summary.resolvedCallCount).toBe(3)
	})

	it("scores a numeric-guess call off the call row itself", () => {
		expect(
			scoreCalls([{ resultPoints: 250, hitTolerance: true, selections: [] }]),
		).toEqual({ totalPoints: 250, resolvedCallCount: 1, correctCount: 1 })
	})

	it("ignores unresolved calls and unresolved selections", () => {
		expect(
			scoreCalls([
				{ resultPoints: null, hitTolerance: null, selections: [] },
				{
					resultPoints: null,
					hitTolerance: null,
					selections: [selection(null, null), selection(20, true)],
				},
			]),
		).toEqual({ totalPoints: 20, resolvedCallCount: 1, correctCount: 1 })
	})

	it("counts a scored-but-wrong numeric call as resolved", () => {
		expect(
			scoreCalls([{ resultPoints: -250, hitTolerance: false, selections: [] }]),
		).toEqual({ totalPoints: -250, resolvedCallCount: 1, correctCount: 0 })
	})

	it("returns zeroes for an empty set", () => {
		expect(scoreCalls([])).toEqual({
			totalPoints: 0,
			resolvedCallCount: 0,
			correctCount: 0,
		})
	})
})

describe("accuracyFrom", () => {
	it("is a percentage of resolved picks", () => {
		expect(
			accuracyFrom({ totalPoints: 0, resolvedCallCount: 4, correctCount: 1 }),
		).toBe(25)
	})

	it("is null rather than 0 when nothing has resolved", () => {
		// A blank record and a 0% record are different things.
		expect(
			accuracyFrom({ totalPoints: 0, resolvedCallCount: 0, correctCount: 0 }),
		).toBeNull()
	})
})

describe("compareRankableEntries", () => {
	const entry = (
		totalPoints: number,
		accuracy: number | null,
		callCount: number,
	) => ({ totalPoints, accuracy, callCount })

	it("sorts by points first", () => {
		expect(
			[entry(10, 100, 1), entry(50, 10, 1)].sort(compareRankableEntries)[0]
				.totalPoints,
		).toBe(50)
	})

	it("breaks a points tie on accuracy", () => {
		expect(
			[entry(50, 40, 1), entry(50, 90, 1)].sort(compareRankableEntries)[0]
				.accuracy,
		).toBe(90)
	})

	it("breaks a points-and-accuracy tie on fewer calls", () => {
		expect(
			[entry(50, 50, 9), entry(50, 50, 3)].sort(compareRankableEntries)[0]
				.callCount,
		).toBe(3)
	})

	it("sorts a blank record last among ties, not first", () => {
		const sorted = [entry(0, null, 0), entry(0, 0, 5)].sort(
			compareRankableEntries,
		)
		expect(sorted[0].accuracy).toBe(0)
		expect(sorted[1].accuracy).toBeNull()
	})
})

describe("team grouping", () => {
	// NBA: divisions are unique across conferences.
	const nba = [
		{ name: "Celtics", conference: "East", division: "Atlantic" },
		{ name: "Bulls", conference: "East", division: "Central" },
		{ name: "Lakers", conference: "West", division: "Pacific" },
	]
	// NFL: both conferences have an East, so a bare division is ambiguous.
	const nfl = [
		{ name: "Bills", conference: "AFC", division: "East" },
		{ name: "Cowboys", conference: "NFC", division: "East" },
		{ name: "Chiefs", conference: "AFC", division: "West" },
	]

	it("uses the bare division when it's unique league-wide", () => {
		const section = teamSectionResolver(nba)
		expect(section(nba[0])).toBe("Atlantic")
		expect(section(nba[2])).toBe("Pacific")
	})

	it("qualifies a division shared across conferences", () => {
		const section = teamSectionResolver(nfl)
		expect(section(nfl[0])).toBe("AFC East")
		expect(section(nfl[1])).toBe("NFC East")
		// "West" is AFC-only in this list, so it needs no prefix.
		expect(section(nfl[2])).toBe("West")
	})

	it("falls back to the conference when there is no division", () => {
		const teams = [{ name: "A", conference: "East", division: null }]
		expect(teamSectionResolver(teams)(teams[0])).toBe("East")
	})

	it("returns null for a league with no split at all", () => {
		const teams = [{ name: "A", conference: null, division: null }]
		expect(teamSectionResolver(teams)(teams[0])).toBeNull()
	})

	it("orders by conference, then division, then name", () => {
		const sorted = [...nfl].sort(compareTeamsByGrouping).map((t) => t.name)
		expect(sorted).toEqual(["Bills", "Chiefs", "Cowboys"])
	})

	it("sorts a team missing its grouping last", () => {
		const teams = [
			{ name: "Zeta", conference: null, division: null },
			{ name: "Alpha", conference: "AFC", division: "East" },
		]
		expect(teams.sort(compareTeamsByGrouping)[0].name).toBe("Alpha")
	})
})

describe("addLeagueStatDelta", () => {
	it("accumulates in place rather than replacing", () => {
		const map = new Map<string, LeagueStatDelta>()
		addLeagueStatDelta(map, "u1", { points: 10, resolvedCallCount: 1 })
		addLeagueStatDelta(map, "u1", { points: -4, correctCount: 1 })
		expect(map.get("u1")).toEqual({
			points: 6,
			resolvedCallCount: 1,
			correctCount: 1,
			callCount: 0,
		})
	})

	it("keeps users separate", () => {
		const map = new Map<string, LeagueStatDelta>()
		addLeagueStatDelta(map, "u1", { points: 10 })
		addLeagueStatDelta(map, "u2", { points: 20 })
		expect(map.get("u1")?.points).toBe(10)
		expect(map.get("u2")?.points).toBe(20)
	})

	it("treats an omitted field as zero, not undefined", () => {
		const map = new Map<string, LeagueStatDelta>()
		addLeagueStatDelta(map, "u1", {})
		expect(map.get("u1")).toEqual({
			points: 0,
			resolvedCallCount: 0,
			correctCount: 0,
			callCount: 0,
		})
	})
})
