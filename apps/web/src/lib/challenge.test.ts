import { describe, expect, it } from "vitest"
import {
	challengePointsRange,
	groupCandidates,
	recordLine,
} from "./challenge"

const game = (id: string, startsAt: string) => ({
	id,
	startsAt,
	awayTeam: { abbreviation: "BUF" },
	homeTeam: { abbreviation: id.toUpperCase() },
})

const q = (
	id: string,
	locksAt: string,
	g: ReturnType<typeof game> | null,
	league = "NFL",
) => ({ id, title: id, locksAt, league: { abbreviation: league }, game: g })

describe("groupCandidates", () => {
	it("puts games first by start time, then season-long by league", () => {
		const late = game("lar", "2026-10-12T20:25:00Z")
		const early = game("mia", "2026-10-12T17:00:00Z")
		const groups = groupCandidates([
			q("wins", "2026-10-20T00:00:00Z", null, "NBA"),
			q("total", "2026-10-12T20:25:00Z", late),
			q("sacks", "2026-10-12T17:00:00Z", early),
			q("mvp", "2026-10-20T00:00:00Z", null, "MLB"),
			q("yards", "2026-10-12T17:00:00Z", early),
		])
		expect(groups.map((g) => g.title)).toEqual([
			"BUF @ MIA",
			"BUF @ LAR",
			"MLB · Season long",
			"NBA · Season long",
		])
		expect(groups[0].questions.map((x) => x.id)).toEqual(["sacks", "yards"])
		expect(groups[0].gameId).toBe("mia")
	})
})

describe("recordLine", () => {
	it("only shows draws once there's been one", () => {
		expect(recordLine({ wins: 3, losses: 1, draws: 0 })).toBe("3-1")
		expect(recordLine({ wins: 3, losses: 1, draws: 2 })).toBe("3-1-2")
	})
})

describe("challengePointsRange", () => {
	const priced = {
		shape: "PLAYER_STAT_OVER_UNDER" as const,
		isOfficial: true,
		isPriced: true,
		lossRate: 1,
		fieldConviction: 100,
		options: [
			{
				id: "over",
				convictionTotal: 60,
				lossRate: 0.8,
				winMult: 1.5,
				modelHitRate: 0.4,
			},
			{
				id: "under",
				convictionTotal: 40,
				lossRate: 1.2,
				winMult: 0.9,
				modelHitRate: 0.6,
			},
		],
	}

	it("pays a priced pick its price, with no early bonus", () => {
		const range = challengePointsRange(
			priced,
			{ conviction: null, selections: [{ optionId: "over", conviction: 100 }] },
			false,
		)
		expect(range).toEqual({ winLow: 225, winHigh: 225, lose: 120 })
	})

	it("gives a numeric guess a range and nothing without conviction", () => {
		const numeric = {
			...priced,
			shape: "PLAYER_STAT_NUMERIC_GUESS" as const,
			isPriced: false,
			options: [],
		}
		const range = challengePointsRange(
			numeric,
			{ conviction: 50, selections: [] },
			true,
		)
		expect(range && range.winHigh > range.winLow).toBe(true)
		expect(
			challengePointsRange(numeric, { conviction: null, selections: [] }, true),
		).toBeNull()
	})
})
