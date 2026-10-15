import { describe, expect, it } from "vitest"
import {
	BASE_POINTS_BY_SHAPE,
	basePointsFor,
	COMMUNITY_POINTS_MULT,
	breakEvenHitRate,
	breakEvenLossRate,
	convictionEdge,
	crowdTierFor,
	crowdTotals,
	defaultLossRate,
	duelProbability,
	pairedDuelProbability,
	expectedFieldShare,
	earlyTierFor,
	effectiveLossRate,
	fieldPct,
	leaderProbabilities,
	hitTolerance,
	isNumericGuessShape,
	isPricedQuestion,
	isSeasonLongShape,
	LOSS_RATE_BY_SHAPE,
	PLAYER_EDGE,
	MIN_EDGE_SAMPLE,
	NUMERIC_GUESS_SHAPES,
	numericGuessPoints,
	overProbability,
	pointsAtStake,
	pointsCommitted,
	type QuestionShape,
	SEASON_LONG_SHAPES,
	seasonEarlyTierFor,
	SIDE_LOSS_RATE_BOUNDS,
	selectionPoints,
	shapesInFamily,
	SIDE_WIN_MULT_MAX,
	sidePrice,
	SEASON_PLAY_FLOOR,
	seasonPlayWeight,
	seriesStageWeight,
	sidePrices,
	targetHitRate,
	targetLossRate,
	STREAK_FAMILY_BY_SHAPE,
	TIER_MAX_MULT,
	TIER_MIN_MULT,
	tierFor,
	toleranceBand,
	resolveStreakMode,
} from "./index"

const ALL_SHAPES: QuestionShape[] = [
	"player_stat_over_under",
	"team_stat_over_under",
	"player_season_stat_over_under",
	"team_season_stat_over_under",
	"game_total_over_under",
	"player_stat_numeric_guess",
	"team_stat_numeric_guess",
	"player_vs_player",
	"player_vs_player_season",
	"team_vs_team",
	"team_vs_team_season",
	"yes_no_prop",
	"player_season_award",
	"team_season_award",
	"player_award_finalists",
	"team_season_stat_numeric_guess",
	"player_game_stat_leader",
	"player_season_stat_leader",
	"player_team_season_stat_leader",
]

describe("BASE_POINTS_BY_SHAPE", () => {
	it("covers every shape with a positive value", () => {
		for (const shape of ALL_SHAPES) {
			expect(BASE_POINTS_BY_SHAPE[shape], shape).toBeGreaterThan(0)
		}
		expect(Object.keys(BASE_POINTS_BY_SHAPE).sort()).toEqual(
			[...ALL_SHAPES].sort(),
		)
	})

	it("rates a season-scoped shape the same as its game-scoped sibling", () => {
		// Documented intent: a season-long window changes what has to be
		// forecast, not the structure of the pick.
		expect(BASE_POINTS_BY_SHAPE.player_season_stat_over_under).toBe(
			BASE_POINTS_BY_SHAPE.player_stat_over_under,
		)
		expect(BASE_POINTS_BY_SHAPE.team_season_stat_numeric_guess).toBe(
			BASE_POINTS_BY_SHAPE.team_stat_numeric_guess,
		)
		expect(BASE_POINTS_BY_SHAPE.player_season_stat_leader).toBe(
			BASE_POINTS_BY_SHAPE.player_game_stat_leader,
		)
	})

	it("rates every 2-option shape identically regardless of subject", () => {
		const binary: QuestionShape[] = [
			"yes_no_prop",
			"player_vs_player",
			"team_vs_team",
			"player_stat_over_under",
			"game_total_over_under",
		]
		const rates = new Set(binary.map((s) => BASE_POINTS_BY_SHAPE[s]))
		expect(rates.size).toBe(1)
	})
})

describe("basePointsFor", () => {
	it("scales an unpriced community question's base down", () => {
		for (const shape of ["yes_no_prop", "player_stat_numeric_guess"] as const) {
			expect(basePointsFor({ shape, isOfficial: false, isPriced: false })).toBe(
				BASE_POINTS_BY_SHAPE[shape] * COMMUNITY_POINTS_MULT,
			)
		}
	})

	it("leaves a priced community question at its shape's base", () => {
		expect(
			basePointsFor({
				shape: "player_stat_over_under",
				isOfficial: false,
				isPriced: true,
			}),
		).toBe(BASE_POINTS_BY_SHAPE.player_stat_over_under)
	})

	it("leaves an official question at its shape's base", () => {
		expect(
			basePointsFor({
				shape: "yes_no_prop",
				isOfficial: true,
				isPriced: false,
			}),
		).toBe(BASE_POINTS_BY_SHAPE.yes_no_prop)
	})
})

describe("isPricedQuestion", () => {
	it("is priced when any option carries the model's chance", () => {
		expect(
			isPricedQuestion([{ modelHitRate: 0.4 }, { modelHitRate: 0.6 }]),
		).toBe(true)
		expect(isPricedQuestion([{ modelHitRate: null }, {}])).toBe(false)
	})
})

describe("breakEvenHitRate", () => {
	it("is even odds at a full loss and a third at half", () => {
		expect(breakEvenHitRate(1)).toBe(0.5)
		expect(breakEvenHitRate(0.5)).toBeCloseTo(1 / 3)
	})
})

describe("breakEvenLossRate", () => {
	it("undoes breakEvenHitRate", () => {
		expect(breakEvenLossRate(0.5)).toBe(1)
		expect(breakEvenLossRate(0.25)).toBeCloseTo(1 / 3)
		expect(breakEvenLossRate(breakEvenHitRate(0.5))).toBeCloseTo(0.5)
	})
})

describe("overProbability", () => {
	const ratios = [0.6, 0.8, 0.9, 1, 1.1, 1.2, 1.4]

	it("is the smoothed share of ratios past the line's ratio", () => {
		// 20.5 / 20 = 1.025: three ratios clear it
		expect(overProbability(ratios, 20, 20.5)).toBeCloseTo(3.5 / 8)
	})

	it("never reads as a sure thing past every ratio", () => {
		expect(overProbability(ratios, 20, 40.5)).toBeCloseTo(0.5 / 8)
		expect(overProbability(ratios, 20, 5.5)).toBeCloseTo(7.5 / 8)
	})
})

describe("targetLossRate", () => {
	it("leaves a pick at its reference hit rate PLAYER_EDGE per committed point", () => {
		for (const hitRate of [0.2, 1 / 3, 0.5, 0.7]) {
			const rate = targetLossRate(hitRate)
			expect(hitRate - (1 - hitRate) * rate).toBeCloseTo(PLAYER_EDGE)
		}
	})

	it("sits below break-even", () => {
		expect(targetLossRate(0.5)).toBeLessThan(breakEvenLossRate(0.5))
	})
})

describe("targetHitRate", () => {
	it("undoes targetLossRate", () => {
		expect(targetHitRate(targetLossRate(0.4))).toBeCloseTo(0.4)
		expect(targetLossRate(targetHitRate(0.5))).toBeCloseTo(0.5)
	})
})

describe("sidePrices", () => {
	const coinFlip = LOSS_RATE_BY_SHAPE.team_vs_team

	it("prices an even chance as a coin flip on both sides", () => {
		const even = { winMult: 1, lossRate: coinFlip }
		expect(sidePrices(0.5)).toEqual({ over: even, under: even })
	})

	it("raises the unlikely side's win and the likely side's miss", () => {
		expect(sidePrices(0.65)).toEqual({
			over: { winMult: 1, lossRate: 1.8 },
			under: { winMult: 1.84, lossRate: coinFlip },
		})
	})

	it("moves off a coin flip with any lean, however small", () => {
		const { over, under } = sidePrices(0.55)
		expect(over.lossRate).toBeGreaterThan(coinFlip)
		expect(under.winMult).toBeGreaterThan(1)
	})

	it("leaves a caller with no edge at PLAYER_EDGE on either side", () => {
		for (const p of [0.1, 0.25, 0.35, 0.45, 0.55, 0.6]) {
			const price = sidePrice(p)
			expect(p * price.winMult - (1 - p) * price.lossRate).toBeCloseTo(
				PLAYER_EDGE,
				2,
			)
		}
	})

	it("never pays the likely side less than committed", () => {
		expect(sidePrice(0.85).winMult).toBe(1)
	})

	it("prices a long shot past the win cap on its miss instead", () => {
		expect(sidePrice(0.1)).toEqual({ winMult: SIDE_WIN_MULT_MAX, lossRate: 0.42 })
		expect(sidePrice(0.001).lossRate).toBe(SIDE_LOSS_RATE_BOUNDS.min)
	})

	it("caps the likely side's miss, leaving it above PLAYER_EDGE", () => {
		expect(sidePrice(0.75).lossRate).toBe(SIDE_LOSS_RATE_BOUNDS.max)
		expect(0.75 - 0.25 * SIDE_LOSS_RATE_BOUNDS.max).toBeGreaterThan(PLAYER_EDGE)
	})

	it("prices each over/under side as its own sidePrice", () => {
		expect(sidePrices(0.65).over).toEqual(sidePrice(0.65))
		expect(sidePrices(0.65).under).toEqual(sidePrice(0.35))
	})
})

describe("duelProbability", () => {
	const ratios = [0.5, 0.8, 1, 1.2, 1.5]

	it("is even between two sides expected to produce the same", () => {
		expect(duelProbability(ratios, 10, 10)).toBeCloseTo(0.5, 10)
	})

	it("favors the side with the higher expectation", () => {
		const p = duelProbability(ratios, 12, 8)
		expect(p).toBeGreaterThan(0.5)
		expect(p).toBeLessThan(1)
		expect(duelProbability(ratios, 8, 12)).toBeCloseTo(1 - p, 10)
	})

	it("never reads as certain, however lopsided", () => {
		expect(duelProbability(ratios, 100, 1)).toBeLessThan(1)
		expect(duelProbability(ratios, 1, 100)).toBeGreaterThan(0)
	})
})

describe("pairedDuelProbability", () => {
	it("keeps what moved both sides of a game at once", () => {
		// Every game moved both sides the same way, so the side expected to
		// produce more always did.
		const together: [number, number][] = [
			[0.7, 0.7],
			[1, 1],
			[1.3, 1.3],
		]
		expect(pairedDuelProbability(together, 11, 10)).toBeCloseTo(3.5 / 4, 10)
		// Mixed across games instead, the same results leave room for upsets.
		expect(duelProbability([0.7, 1, 1.3], 11, 10)).toBeLessThan(3.5 / 4)
	})

	it("is even between two sides expected to produce the same over even games", () => {
		const pairs: [number, number][] = [
			[1.2, 0.8],
			[0.8, 1.2],
		]
		expect(pairedDuelProbability(pairs, 10, 10)).toBeCloseTo(0.5, 10)
	})
})

describe("leaderProbabilities", () => {
	const ratios = [0.5, 0.8, 1, 1.2, 1.5]

	it("gives every contender a chance, summing to 1", () => {
		const chances = leaderProbabilities(ratios, [100, 60, 40])
		expect(chances.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
		for (const chance of chances) {
			expect(chance).toBeGreaterThan(0)
			expect(chance).toBeLessThan(1)
		}
	})

	it("favors the contender expected to produce the most", () => {
		const [top, middle, bottom] = leaderProbabilities(ratios, [100, 60, 40])
		expect(top).toBeGreaterThan(middle ?? 1)
		expect(middle).toBeGreaterThan(bottom ?? 1)
	})

	it("splits evenly between contenders expected to produce the same", () => {
		const chances = leaderProbabilities(ratios, [50, 50, 50, 50])
		for (const chance of chances) expect(chance).toBeCloseTo(0.25, 10)
	})

	it("matches a head-to-head with two contenders", () => {
		const [first] = leaderProbabilities(ratios, [12, 8])
		expect(first).toBeCloseTo(duelProbability(ratios, 12, 8), 1)
	})

	it("leaves someone expected to produce nothing almost no chance", () => {
		const [, nobody] = leaderProbabilities(ratios, [50, 0])
		expect(nobody).toBeLessThan(0.1)
	})
})

describe("effectiveLossRate", () => {
	it("takes the option's rate when it has one", () => {
		expect(effectiveLossRate(1, 0.4)).toBe(0.4)
		expect(effectiveLossRate(1, null)).toBe(1)
		expect(effectiveLossRate(0.5, undefined)).toBe(0.5)
	})
})

describe("LOSS_RATE_BY_SHAPE", () => {
	it("covers every shape with a rate in (0, 1]", () => {
		for (const shape of ALL_SHAPES) {
			expect(LOSS_RATE_BY_SHAPE[shape], shape).toBeGreaterThan(0)
			expect(LOSS_RATE_BY_SHAPE[shape], shape).toBeLessThanOrEqual(1)
		}
		expect(Object.keys(LOSS_RATE_BY_SHAPE).sort()).toEqual(
			[...ALL_SHAPES].sort(),
		)
	})

	it("prices every 2-option shape as a coin flip at PLAYER_EDGE", () => {
		const binary: QuestionShape[] = [
			"yes_no_prop",
			"player_vs_player",
			"team_vs_team",
			"player_stat_over_under",
			"game_total_over_under",
		]
		for (const shape of binary) {
			expect(LOSS_RATE_BY_SHAPE[shape], shape).toBeCloseTo(
				targetLossRate(0.5),
			)
		}
	})

	it("rates a season numeric guess the same as a game one", () => {
		expect(LOSS_RATE_BY_SHAPE.team_season_stat_numeric_guess).toBe(
			LOSS_RATE_BY_SHAPE.team_stat_numeric_guess,
		)
	})
})

describe("defaultLossRate", () => {
	it("takes the shape's rate for most questions", () => {
		expect(defaultLossRate("yes_no_prop", {})).toBe(
			LOSS_RATE_BY_SHAPE.yes_no_prop,
		)
		expect(defaultLossRate("player_game_stat_leader", {})).toBe(
			LOSS_RATE_BY_SHAPE.player_game_stat_leader,
		)
		expect(defaultLossRate("player_season_award", { picksRequired: 1 })).toBe(
			LOSS_RATE_BY_SHAPE.player_season_award,
		)
	})

	it("prices a finalists pick at random among the finalists", () => {
		expect(defaultLossRate("player_award_finalists", { optionCount: 3 })).toBe(
			0.47,
		)
		expect(defaultLossRate("player_award_finalists", { optionCount: 5 })).toBe(
			0.23,
		)
		expect(defaultLossRate("player_award_finalists", { optionCount: 2 })).toBe(
			0.96,
		)
		expect(defaultLossRate("player_award_finalists", {})).toBe(
			LOSS_RATE_BY_SHAPE.player_award_finalists,
		)
	})

	it("keeps the full rate on an award asked with several picks", () => {
		expect(defaultLossRate("player_season_award", { picksRequired: 5 })).toBe(1)
		expect(defaultLossRate("team_season_award", { picksRequired: 2 })).toBe(1)
	})
})

describe("shape sets", () => {
	it("classifies season-long shapes", () => {
		expect(isSeasonLongShape("player_season_award")).toBe(true)
		expect(isSeasonLongShape("team_vs_team_season")).toBe(true)
		expect(isSeasonLongShape("team_vs_team")).toBe(false)
	})

	it("keeps yes_no_prop out of the season-long set", () => {
		// It has no gameId but its locksAt is an arbitrary creator-chosen
		// window, so it scores earliness by rank, not by season progress.
		expect(isSeasonLongShape("yes_no_prop")).toBe(false)
	})

	it("classifies numeric-guess shapes, including the season-scoped one", () => {
		expect(isNumericGuessShape("player_stat_numeric_guess")).toBe(true)
		expect(isNumericGuessShape("team_stat_numeric_guess")).toBe(true)
		expect(isNumericGuessShape("team_season_stat_numeric_guess")).toBe(true)
		expect(isNumericGuessShape("player_stat_over_under")).toBe(false)
	})

	it("only lists real shapes in each set", () => {
		for (const shape of [...SEASON_LONG_SHAPES, ...NUMERIC_GUESS_SHAPES]) {
			expect(ALL_SHAPES, shape).toContain(shape)
		}
	})
})

describe("fieldPct", () => {
	it("is the option's share of the field as a percentage", () => {
		expect(fieldPct(1, 4)).toBe(25)
		expect(fieldPct(3, 3)).toBe(100)
	})

	it("returns 0 rather than NaN when nobody has called", () => {
		expect(fieldPct(0, 0)).toBe(0)
	})
})

describe("seasonPlayWeight", () => {
	it("counts in full from SEASON_PLAY_FULL_SHARE of the weeks up", () => {
		expect(seasonPlayWeight(8, 10)).toBe(1)
		expect(seasonPlayWeight(10, 10)).toBe(1)
	})

	it("scales down evenly below that", () => {
		expect(seasonPlayWeight(4, 10)).toBeCloseTo(0.5, 10)
		expect(seasonPlayWeight(2, 10)).toBeCloseTo(0.25, 10)
	})

	it("never drops under the floor", () => {
		expect(seasonPlayWeight(0, 20)).toBe(SEASON_PLAY_FLOOR)
	})

	it("is full before any week counts", () => {
		expect(seasonPlayWeight(0, 0)).toBe(1)
	})
})

describe("seriesStageWeight", () => {
	it("is full before Game 1", () => {
		expect(seriesStageWeight(0, 7)).toBe(1)
	})

	it("drops by one game's share for each game played", () => {
		expect(seriesStageWeight(2, 7)).toBe(0.714)
		expect(seriesStageWeight(6, 7)).toBe(0.143)
		expect(seriesStageWeight(1, 3)).toBe(0.667)
	})

	it("stays between 0 and 1", () => {
		expect(seriesStageWeight(9, 7)).toBe(0)
		expect(seriesStageWeight(0, 0)).toBe(1)
	})
})

describe("crowdTotals", () => {
	it("weights each option by the conviction behind it", () => {
		const { byOption, field } = crowdTotals([
			{ callId: "a", optionId: "x", conviction: 100 },
			{ callId: "b", optionId: "y", conviction: 1 },
			{ callId: "c", optionId: "y", conviction: 1 },
		])
		expect(byOption.get("x")).toBe(100)
		expect(byOption.get("y")).toBe(2)
		expect(field).toBe(102)
		// Two throwaway calls on y leave x's pick looking popular, not rare.
		expect(fieldPct(byOption.get("x") ?? 0, field)).toBeGreaterThan(98)
	})

	it("counts a multi-pick call once in the field, at its average conviction", () => {
		const { byOption, field } = crowdTotals([
			{ callId: "a", optionId: "x", conviction: 80 },
			{ callId: "a", optionId: "y", conviction: 40 },
		])
		expect(byOption.get("x")).toBe(80)
		expect(byOption.get("y")).toBe(40)
		expect(field).toBe(60)
	})
})

describe("crowdTierFor", () => {
	it("has no tier on a priced side", () => {
		expect(crowdTierFor(5, 2, { modelHitRate: 0.3 })).toBeNull()
	})

	it("reads an unpriced side off the field, as tierFor does", () => {
		expect(crowdTierFor(5, 2)).toEqual(tierFor(5, 2))
		expect(crowdTierFor(5, 2, { winMult: null, modelHitRate: null })).toEqual(
			tierFor(5, 2),
		)
	})
})

describe("tierFor", () => {
	// The binary-question points the curve's own documentation claims.
	it.each([
		[50, 1.0],
		[33.33, 1.2],
		[22.22, 1.45],
		[20, 1.52],
		[10, 2.09],
		[5, 2.87],
		[2, 4.37],
		[1, 6.0],
	])("binary question at %i%% of the field -> ~%sx", (pct, expected) => {
		expect(tierFor(pct, 2).mult).toBeCloseTo(expected, 2)
	})

	it("clamps to the documented range at both ends", () => {
		expect(tierFor(100, 2).mult).toBe(TIER_MIN_MULT)
		expect(tierFor(0, 2).mult).toBe(TIER_MAX_MULT)
	})

	it("normalizes against option count, not raw field share", () => {
		// 5% of a 2-option field is genuinely lopsided; 5% of a 20-option field
		// is thinner than an even split and must not read as bolder.
		expect(tierFor(5, 2).mult).toBeGreaterThan(tierFor(5, 20).mult)
		// An even split scores the same no matter how wide the field is.
		expect(tierFor(50, 2).mult).toBeCloseTo(tierFor(10, 10).mult, 10)
	})

	it("pays any minority side more than the majority on a binary question", () => {
		expect(tierFor(60, 2).mult).toBe(TIER_MIN_MULT)
		expect(tierFor(40, 2).mult).toBeGreaterThan(TIER_MIN_MULT)
	})

	it("decreases monotonically as an option gets more popular", () => {
		const mults = [1, 2, 5, 10, 20, 50, 100].map((p) => tierFor(p, 2).mult)
		for (let i = 1; i < mults.length; i++) {
			expect(mults[i]).toBeLessThanOrEqual(mults[i - 1])
		}
	})

	it("expects every option at an even split", () => {
		expect(expectedFieldShare(2)).toBe(0.5)
		expect(expectedFieldShare(4)).toBe(0.25)
	})

	it("labels by multiplier band", () => {
		expect(tierFor(100, 2).label).toBe("SAFE")
		expect(tierFor(20, 2).label).toBe("STEADY")
		expect(tierFor(5, 2).label).toBe("BOLD")
		expect(tierFor(2, 2).label).toBe("DARING")
		expect(tierFor(0.5, 2).label).toBe("FEARLESS")
	})
})

describe("earlyTierFor", () => {
	it.each([
		[10, 100, 2.0],
		[25, 100, 1.52],
		[50, 100, 1.23],
		[100, 100, 1.0],
	])("rank %i of %i -> ~%sx", (rank, total, expected) => {
		expect(earlyTierFor(rank, total).mult).toBeCloseTo(expected, 2)
	})

	it("caps at 2x, well below the contrarian ceiling", () => {
		expect(earlyTierFor(1, 1000).mult).toBe(2)
		expect(earlyTierFor(1, 1000).mult).toBeLessThan(TIER_MAX_MULT)
	})

	it("returns a neutral multiplier when there is no field yet", () => {
		expect(earlyTierFor(0, 0)).toEqual({ mult: 1, label: "STANDARD" })
	})

	it("labels by multiplier band", () => {
		expect(earlyTierFor(100, 100).label).toBe("STANDARD")
		expect(earlyTierFor(50, 100).label).toBe("AHEAD OF THE CURVE")
		expect(earlyTierFor(25, 100).label).toBe("EARLY")
		expect(earlyTierFor(5, 100).label).toBe("FIRST MOVER")
	})
})

describe("seasonEarlyTierFor", () => {
	it.each([
		[25, 100, 1.94],
		[50, 100, 1.39],
		[75, 100, 1.15],
		[100, 100, 1.0],
	])("%i of %i games played -> ~%sx", (played, total, expected) => {
		expect(seasonEarlyTierFor(played, total).mult).toBeCloseTo(expected, 2)
	})

	it("treats an unsynced window as fully preseason rather than NaN", () => {
		expect(seasonEarlyTierFor(0, 0).mult).toBe(3)
		expect(seasonEarlyTierFor(0, 82).mult).toBe(3)
	})

	it("ranges wider than rank-based earliness but under the contrarian tier", () => {
		expect(seasonEarlyTierFor(0, 82).mult).toBeGreaterThan(
			earlyTierFor(1, 1000).mult,
		)
		expect(seasonEarlyTierFor(0, 82).mult).toBeLessThan(TIER_MAX_MULT)
	})

	it("labels by multiplier band", () => {
		expect(seasonEarlyTierFor(100, 100).label).toBe("STANDARD")
		expect(seasonEarlyTierFor(50, 100).label).toBe("EARLY SEASON")
		expect(seasonEarlyTierFor(25, 100).label).toBe("FIRST QUARTER")
		expect(seasonEarlyTierFor(0, 100).label).toBe("PRESEASON")
	})
})

describe("pointsCommitted", () => {
	it("is the base rate scaled by conviction, with no loss rate applied", () => {
		expect(pointsCommitted(250, 100)).toBe(250)
		expect(pointsCommitted(250, 50)).toBe(125)
		expect(pointsCommitted(150, 40)).toBe(60)
	})

	it("does not vary with the shape's loss rate, unlike pointsAtStake", () => {
		// The whole point of the two being separate: a stat leader and a yes/no
		// at the same conviction commit proportionally to their base rate, but
		// risk wildly different amounts.
		expect(pointsCommitted(250, 50)).toBe(pointsCommitted(250, 50))
		expect(pointsAtStake(250, 0.25, 50)).toBe(31)
		expect(pointsAtStake(250, 1, 50)).toBe(125)
	})
})

describe("pointsAtStake", () => {
	it("scales linearly with conviction and with the loss rate", () => {
		expect(pointsAtStake(150, 1, 100)).toBe(150)
		expect(pointsAtStake(150, 1, 50)).toBe(75)
		expect(pointsAtStake(250, 0.5, 50)).toBe(63)
		expect(pointsAtStake(250, 0.25, 50)).toBe(31)
	})

	it("returns a whole number, and can floor to zero at minimum conviction", () => {
		// 250 x 0.01 x 0.25 = 0.625. A real, settled call that risked nothing,
		// which is why anything dividing by a stake total has to guard the
		// denominator rather than the call count.
		expect(pointsAtStake(250, 0.25, 1)).toBe(1)
		expect(pointsAtStake(100, 0.04, 1)).toBe(0)
	})

	// The two assertions that stop the loss branch drifting back out into its
	// own copy - they tie each payout function to this one rather than to a
	// literal, so a change to either side has to break one of them.
	it("is exactly what selectionPoints charges for a miss", () => {
		const base = BASE_POINTS_BY_SHAPE.player_stat_over_under
		const lossRate = LOSS_RATE_BY_SHAPE.player_stat_over_under
		for (const conviction of [1, 37, 50, 100]) {
			expect(selectionPoints(base, lossRate, 50, 2, conviction, false, 1)).toBe(
				-pointsAtStake(base, lossRate, conviction),
			)
		}
	})

	it("is exactly what numericGuessPoints charges for a miss", () => {
		const base = BASE_POINTS_BY_SHAPE.player_stat_numeric_guess
		const lossRate = LOSS_RATE_BY_SHAPE.player_stat_numeric_guess
		const [result] = numericGuessPoints(
			base,
			lossRate,
			[
				{
					callId: "a",
					guessValue: 5,
					conviction: 73,
					createdAt: new Date("2026-01-01"),
				},
			],
			500,
			{ mode: "percentage", pct: 0.1 },
		)
		expect(result?.hit).toBe(false)
		expect(result?.points).toBe(-pointsAtStake(base, lossRate, 73))
	})
})

describe("selectionPoints", () => {
	const base = BASE_POINTS_BY_SHAPE.yes_no_prop
	const lossRate = 1

	it("scales a win by conviction, contrarian tier and earliness", () => {
		// 50% of the field on a binary question is a 1x tier, so with a neutral
		// early multiplier a full-conviction win is exactly the base rate.
		expect(selectionPoints(base, lossRate, 50, 2, 100, true, 1)).toBe(base)
		expect(selectionPoints(base, lossRate, 50, 2, 50, true, 1)).toBe(base / 2)
	})

	it("pays a priced side's win multiplier on a hit, and never on a miss", () => {
		expect(
			selectionPoints(base, lossRate, 50, 2, 100, true, 1, { winMult: 1.84 }),
		).toBe(Math.round(base * 1.84))
		expect(
			selectionPoints(base, lossRate, 50, 2, 100, false, 1, { winMult: 1.84 }),
		).toBe(selectionPoints(base, lossRate, 50, 2, 100, false, 1))
	})

	it("pays a priced side no boldness, however few people called it", () => {
		const priced = { winMult: 1.84, modelHitRate: 0.3 }
		expect(selectionPoints(base, lossRate, 1, 2, 100, true, 1.5, priced)).toBe(
			Math.round(base * 1.84 * 1.5),
		)
	})

	it("multiplies the two bonuses together on a win", () => {
		const tier = tierFor(10, 2).mult
		expect(selectionPoints(base, lossRate, 10, 2, 100, true, 1.5)).toBe(
			Math.round(base * tier * 1.5),
		)
	})

	it("charges a flat loss - no tier or earliness on the downside", () => {
		// A wrong call eats the full stake regardless of how contrarian or how
		// early it was, which is what stops early-and-often from being farmable.
		const contrarianLoss = selectionPoints(base, lossRate, 1, 2, 100, false, 2)
		const safeLoss = selectionPoints(base, lossRate, 99, 2, 100, false, 1)
		expect(contrarianLoss).toBe(-base)
		expect(safeLoss).toBe(-base)
	})

	it("scales the loss by conviction only", () => {
		expect(selectionPoints(base, lossRate, 50, 2, 25, false, 1)).toBe(
			-Math.round(base * 0.25),
		)
	})

	it("scales the loss by the loss rate, never the win", () => {
		expect(selectionPoints(base, 0.25, 50, 2, 100, false, 1)).toBe(
			-Math.round(base * 0.25),
		)
		expect(selectionPoints(base, 0.25, 50, 2, 100, true, 1)).toBe(base)
	})

	it("returns whole numbers", () => {
		const points = selectionPoints(base, lossRate, 7, 3, 37, true, 1.23)
		expect(Number.isInteger(points)).toBe(true)
	})
})

describe("toleranceBand", () => {
	it("floors a percentage band rather than rounding to nearest", () => {
		// 12 * 0.15 = 1.8; rounding would hand out a more forgiving band than
		// the 15% that was promised.
		expect(toleranceBand(12, { mode: "percentage", pct: 0.15 })).toBe(1)
	})

	it("never lets a percentage band collapse below 1", () => {
		expect(toleranceBand(2, { mode: "percentage", pct: 0.15 })).toBe(1)
		expect(toleranceBand(0, { mode: "percentage", pct: 0.15 })).toBe(1)
	})

	it("uses a negative actual's magnitude", () => {
		expect(toleranceBand(-30, { mode: "percentage", pct: 0.1 })).toBe(3)
	})

	it("passes an absolute band through untouched, sub-1 included", () => {
		// A rate stat's band is already in the stat's own unit - flooring it or
		// forcing it to 1 would make .275 +/- 0.02 meaningless.
		expect(toleranceBand(0.275, { mode: "absolute", amount: 0.02 })).toBe(0.02)
		expect(toleranceBand(100, { mode: "absolute", amount: 0.02 })).toBe(0.02)
	})
})

describe("hitTolerance", () => {
	const pct = { mode: "percentage", pct: 0.1 } as const

	it("measures the band off the actual value, not the guess", () => {
		// band = floor(100 * 0.1) = 10
		expect(hitTolerance(90, 100, pct)).toBe(true)
		expect(hitTolerance(110, 100, pct)).toBe(true)
		expect(hitTolerance(89, 100, pct)).toBe(false)
		expect(hitTolerance(111, 100, pct)).toBe(false)
	})

	it("counts the band edge as a hit", () => {
		// Exactly on the band in both directions. Binary-exact values on
		// purpose: a decimal band like 0.275 +/- 0.02 lands a hair over the
		// band in IEEE-754 and would make this assertion about float
		// representation rather than about the rule being tested.
		expect(hitTolerance(90, 100, pct)).toBe(true)
		expect(hitTolerance(0.75, 1, { mode: "absolute", amount: 0.25 })).toBe(true)
		expect(hitTolerance(1.25, 1, { mode: "absolute", amount: 0.25 })).toBe(true)
	})
})

describe("numericGuessPoints", () => {
	const base = BASE_POINTS_BY_SHAPE.player_stat_numeric_guess
	const lossRate = LOSS_RATE_BY_SHAPE.player_stat_numeric_guess
	const spec = { mode: "percentage", pct: 0.1 } as const
	const at = (minutes: number) => new Date(2026, 0, 1, 0, minutes)

	function guess(callId: string, guessValue: number, minutes: number) {
		return { callId, guessValue, conviction: 100, createdAt: at(minutes) }
	}

	it("returns one result per guess, hits and misses alike", () => {
		const results = numericGuessPoints(
			base,
			lossRate,
			[guess("a", 100, 0), guess("b", 500, 1)],
			100,
			spec,
		)
		expect(results.map((r) => r.callId)).toEqual(["a", "b"])
	})

	it("reads closeness off the field's conviction, so a throwaway guess barely counts", () => {
		const [exact, , throwaway] = numericGuessPoints(
			base,
			lossRate,
			[
				guess("a", 100, 0),
				{ ...guess("b", 100, 1), conviction: 50 },
				{ ...guess("c", 101, 2), conviction: 1 },
			],
			100,
			spec,
		)
		// 150 of the field's 151 conviction landed at least as close as the
		// exact guesses, the throwaway's 1 among the rest.
		expect(exact.closenessFieldPct).toBeCloseTo((150 / 151) * 100, 10)
		expect(throwaway.closenessFieldPct).toBe(100)
	})

	it("leaves earliness and the season-play weight out of challenge points", () => {
		const [early, late, missed] = numericGuessPoints(
			base,
			lossRate,
			[
				{ ...guess("a", 100, 0), weight: 0.5 },
				guess("b", 100, 1),
				{ ...guess("c", 500, 2), weight: 0.5 },
			],
			100,
			spec,
		)
		// Same guess, same conviction: the earlier one scores more, but both
		// are worth the same in a challenge.
		expect(early.points).toBeGreaterThan(0)
		expect(early.challengePoints).toBe(late.challengePoints)
		expect(late.challengePoints).toBe(
			Math.round(base * (late.closenessMult ?? 0)),
		)
		expect(missed.points).toBe(-pointsAtStake(base * 0.5, lossRate, 100))
		expect(missed.challengePoints).toBe(-pointsAtStake(base, lossRate, 100))
	})

	it("charges a miss the stake at the loss rate and records no closeness", () => {
		const [miss] = numericGuessPoints(
			base,
			lossRate,
			[guess("a", 500, 0)],
			100,
			spec,
		)
		expect(miss.hit).toBe(false)
		expect(miss.points).toBe(-Math.round(base * lossRate))
		expect(miss.closenessMult).toBeNull()
		expect(miss.closenessFieldPct).toBeNull()
	})

	it("scales a miss by conviction", () => {
		const [miss] = numericGuessPoints(
			base,
			lossRate,
			[{ callId: "a", guessValue: 500, conviction: 40, createdAt: at(0) }],
			100,
			spec,
		)
		expect(miss.points).toBe(-Math.round(base * 0.4 * lossRate))
	})

	it("sizes closeness against the whole field, not just the hitters", () => {
		// One hit among four callers: 1/4 of the field landed at least this
		// close, so the share is 25% - not the 100% it would be if only other
		// hitters counted.
		const results = numericGuessPoints(
			base,
			lossRate,
			[
				guess("hit", 100, 0),
				guess("miss1", 500, 1),
				guess("miss2", 600, 2),
				guess("miss3", 700, 3),
			],
			100,
			spec,
		)
		const hit = results.find((r) => r.callId === "hit")
		expect(hit?.closenessFieldPct).toBe(25)
		expect(hit?.closenessMult).toBeCloseTo(tierFor(25, 2).mult, 10)
	})

	it("scores a lone hit in a big field higher than the same hit in a small one", () => {
		const big = numericGuessPoints(
			base,
			lossRate,
			[
				guess("hit", 100, 0),
				...Array.from({ length: 39 }, (_, i) => guess(`m${i}`, 500, i + 1)),
			],
			100,
			spec,
		)
		const small = numericGuessPoints(
			base,
			lossRate,
			[
				guess("hit", 100, 0),
				...Array.from({ length: 3 }, (_, i) => guess(`m${i}`, 500, i + 1)),
			],
			100,
			spec,
		)
		const bigHit = big.find((r) => r.callId === "hit")
		const smallHit = small.find((r) => r.callId === "hit")
		expect(bigHit?.points).toBeGreaterThan(smallHit?.points ?? 0)
	})

	it("scores an obvious answer near the floor when the field converges on it", () => {
		// Ten callers, all correct and all equally close - nobody was rare, so
		// everyone lands at the tier floor.
		const results = numericGuessPoints(
			base,
			lossRate,
			Array.from({ length: 10 }, (_, i) => guess(`c${i}`, 100, i)),
			100,
			spec,
		)
		for (const result of results) {
			expect(result.hit).toBe(true)
			expect(result.closenessFieldPct).toBe(100)
			expect(result.closenessMult).toBe(TIER_MIN_MULT)
		}
	})

	it("ties guesses at the same distance to the same share", () => {
		// Equidistant on opposite sides of the actual: neither is closer.
		const results = numericGuessPoints(
			base,
			lossRate,
			[guess("under", 95, 0), guess("over", 105, 1)],
			100,
			spec,
		)
		const shares = results.map((r) => r.closenessFieldPct)
		expect(shares).toEqual([100, 100])
	})

	it("ranks a closer hit above a farther one", () => {
		const results = numericGuessPoints(
			base,
			lossRate,
			[guess("exact", 100, 0), guess("edge", 109, 1)],
			100,
			spec,
		)
		const exact = results.find((r) => r.callId === "exact")
		const edge = results.find((r) => r.callId === "edge")
		expect(exact?.closenessFieldPct).toBe(50)
		expect(edge?.closenessFieldPct).toBe(100)
		expect(exact?.points).toBeGreaterThan(edge?.points ?? 0)
	})

	it("awards earliness by call order, not by guess quality", () => {
		// Identical guesses, so closeness is identical - only createdAt differs.
		const results = numericGuessPoints(
			base,
			lossRate,
			[guess("late", 100, 100), guess("first", 100, 0)],
			100,
			spec,
		)
		const first = results.find((r) => r.callId === "first")
		const late = results.find((r) => r.callId === "late")
		expect(first?.points).toBeGreaterThan(late?.points ?? 0)
	})

	it("handles an empty field", () => {
		expect(numericGuessPoints(base, lossRate, [], 100, spec)).toEqual([])
	})
})

describe("STREAK_FAMILY_BY_SHAPE", () => {
	it("answers for every shape", () => {
		expect(Object.keys(STREAK_FAMILY_BY_SHAPE).sort()).toEqual(
			[...ALL_SHAPES].sort(),
		)
	})

	it("leaves every season-long shape out of streaks", () => {
		for (const shape of SEASON_LONG_SHAPES) {
			expect(STREAK_FAMILY_BY_SHAPE[shape], shape).toBeNull()
		}
	})

	it("keeps winners to the one who-wins shape", () => {
		expect(shapesInFamily("winners")).toEqual(["team_vs_team"])
	})
})

describe("convictionEdge", () => {
	// Builds a record of `correct` hits and `wrong` misses, with every hit at
	// hitConviction and every miss at missConviction, which makes the expected
	// edge just the difference between those two numbers.
	const record = (
		correct: number,
		wrong: number,
		hitConviction: number,
		missConviction: number,
	) => ({
		resolvedCallCount: correct + wrong,
		correctCount: correct,
		convictionSum: correct * hitConviction + wrong * missConviction,
		convictionSumCorrect: correct * hitConviction,
	})

	it("is positive when the loud calls are the right ones", () => {
		expect(convictionEdge(record(10, 10, 80, 30))).toBe(50)
	})

	it("is negative when the loud calls are the wrong ones", () => {
		expect(convictionEdge(record(10, 10, 30, 80))).toBe(-50)
	})

	it("is zero when conviction says nothing about the outcome", () => {
		expect(convictionEdge(record(10, 10, 55, 55))).toBe(0)
	})

	it("rewards a low-accuracy caller who knows which ones they will miss", () => {
		// 8 hits in 20 is a losing record, but the conviction behind them is
		// where it belongs - this is exactly the caller accuracy alone hides.
		const edge = convictionEdge(record(8, 12, 90, 20))
		expect(edge).toBe(70)
	})

	it("punishes a high-accuracy caller who is loudest on their misses", () => {
		const edge = convictionEdge(record(16, 8, 40, 95))
		expect(edge).toBeLessThan(0)
	})

	it("is null below the sample gate", () => {
		const justUnder = record(MIN_EDGE_SAMPLE - 2, 1, 90, 10)
		expect(justUnder.resolvedCallCount).toBe(MIN_EDGE_SAMPLE - 1)
		expect(convictionEdge(justUnder)).toBeNull()
	})

	it("unlocks exactly at the sample gate", () => {
		const atGate = record(MIN_EDGE_SAMPLE - 1, 1, 90, 10)
		expect(atGate.resolvedCallCount).toBe(MIN_EDGE_SAMPLE)
		expect(convictionEdge(atGate)).toBe(80)
	})

	it("is null with nothing to compare against", () => {
		// An all-hits or all-misses record has no other side to subtract, which
		// is a different statement than "conviction told us nothing" (0).
		expect(convictionEdge(record(30, 0, 70, 0))).toBeNull()
		expect(convictionEdge(record(0, 30, 0, 70))).toBeNull()
	})

	it("is null on an empty record", () => {
		expect(convictionEdge(record(0, 0, 0, 0))).toBeNull()
	})

	it("weights by pick, so one loud miss moves it more than a quiet one", () => {
		const quietMiss = convictionEdge(record(19, 1, 60, 10)) as number
		const loudMiss = convictionEdge(record(19, 1, 60, 100)) as number
		expect(loudMiss).toBeLessThan(quietMiss)
	})
})

describe("resolveStreakMode", () => {
	const track = {
		currentLength: 0,
		bestLength: 0,
		currentColdLength: 0,
		worstColdLength: 0,
	}

	it("honours the side the link asked for, not the side that is live", () => {
		// The case the /hot and /cold split exists for: a group's "best
		// streaks" row and its "cold streaks" row can name this same track, and
		// each has to land where its reader expects.
		const both = {
			...track,
			bestLength: 6,
			currentColdLength: 4,
			worstColdLength: 4,
		}
		expect(resolveStreakMode(both, "hot")).toBe("hot")
		expect(resolveStreakMode(both, "cold")).toBe("cold")
	})

	it("falls back to whichever side is live when the link named none", () => {
		expect(
			resolveStreakMode({ ...track, currentLength: 5, bestLength: 5 }),
		).toBe("hot")
		expect(
			resolveStreakMode({
				...track,
				bestLength: 6,
				currentColdLength: 4,
				worstColdLength: 4,
			}),
		).toBe("cold")
	})

	it("falls through to the other side rather than 404ing a stale link", () => {
		// A track that has only ever missed has no hot side at all.
		const coldOnly = { ...track, currentColdLength: 4, worstColdLength: 4 }
		expect(resolveStreakMode(coldOnly, "hot")).toBe("cold")
		const hotOnly = { ...track, currentLength: 5, bestLength: 5 }
		expect(resolveStreakMode(hotOnly, "cold")).toBe("hot")
	})

	it("is null when neither side clears its floor", () => {
		expect(resolveStreakMode(track, "hot")).toBeNull()
		expect(
			resolveStreakMode({
				...track,
				currentLength: 1,
				bestLength: 1,
				currentColdLength: 2,
				worstColdLength: 2,
			}),
		).toBeNull()
	})
})

