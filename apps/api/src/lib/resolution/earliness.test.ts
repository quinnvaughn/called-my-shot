import {
	earlyTierFor,
	SEASON_EARLY_MAX_MULT,
	seasonEarlyTierFor,
} from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import { earlinessFor } from "./earliness"

const at = (day: number) => new Date(Date.UTC(2026, 0, day))

describe("earlinessFor - by rank", () => {
	it("ranks calls by when they were made, whatever order they arrive in", () => {
		const mults = earlinessFor(
			[
				{ id: "late", createdAt: at(3) },
				{ id: "early", createdAt: at(1) },
				{ id: "middle", createdAt: at(2) },
			],
			{ by: "rank", totalCalls: 3 },
		)
		expect(mults.get("early")).toBe(earlyTierFor(1, 3).mult)
		expect(mults.get("middle")).toBe(earlyTierFor(2, 3).mult)
		expect(mults.get("late")).toBe(earlyTierFor(3, 3).mult)
		expect(mults.get("early")).toBeGreaterThan(mults.get("late") ?? 0)
	})

	it("ranks against every call on the question, not just the ones given", () => {
		const mults = earlinessFor([{ id: "only", createdAt: at(1) }], {
			by: "rank",
			totalCalls: 4,
		})
		expect(mults.get("only")).toBe(earlyTierFor(1, 4).mult)
	})

	it("keeps the given order between calls made at the same instant", () => {
		const mults = earlinessFor(
			[
				{ id: "first", createdAt: at(1) },
				{ id: "second", createdAt: at(1) },
			],
			{ by: "rank", totalCalls: 2 },
		)
		expect(mults.get("first")).toBe(earlyTierFor(1, 2).mult)
		expect(mults.get("second")).toBe(earlyTierFor(2, 2).mult)
	})
})

describe("earlinessFor - by season progress", () => {
	// Ten games a day apart from day 10; the first eight are final.
	const games = Array.from({ length: 10 }, (_, i) => ({
		startsAt: at(10 + i),
		status: i < 8 ? ("final" as const) : ("scheduled" as const),
	}))

	it("scores off games played, not rank among callers", () => {
		const mults = earlinessFor(
			[
				{ id: "preseason", createdAt: at(1) },
				{ id: "late", createdAt: at(30) },
			],
			{ by: "season", games },
		)
		expect(mults.get("preseason")).toBe(SEASON_EARLY_MAX_MULT)
		expect(mults.get("late")).toBe(seasonEarlyTierFor(8, 10).mult)
	})

	it("counts only final games started by the time of the call", () => {
		const mults = earlinessFor([{ id: "mid", createdAt: at(12) }], {
			by: "season",
			games,
		})
		expect(mults.get("mid")).toBe(seasonEarlyTierFor(3, 10).mult)
	})

	it("gives the full multiplier when the window holds no games", () => {
		const mults = earlinessFor([{ id: "c", createdAt: at(1) }], {
			by: "season",
			games: [],
		})
		expect(mults.get("c")).toBe(SEASON_EARLY_MAX_MULT)
	})
})
