import { describe, expect, it } from "vitest"
import {
	challengePointsRange,
	entryPoints,
	groupCandidates,
	openCallRange,
	openPointsBySide,
	totalsOf,
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

describe("entryPoints", () => {
	const question = {
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
	const overPrice = { lossRate: 0.8, winMult: 1.5, modelHitRate: 0.4 }
	const overCall = {
		conviction: null,
		selections: [{ conviction: 100, option: { id: "over" }, ...overPrice }],
	}
	const overDraft = {
		caseText: "",
		guessValue: null,
		conviction: null,
		selections: [{ optionId: "over", conviction: 100 }],
	}

	it("reads a call already in as part of the field", () => {
		const points = entryPoints({
			question,
			viewerCall: overCall,
			creatorCall: null,
			draft: overDraft,
			alreadyCalled: true,
		})
		expect(points.yours).toEqual(
			challengePointsRange(
				question,
				{
					conviction: null,
					selections: [
						{ optionId: "over", conviction: 100, price: overPrice },
					],
				},
				false,
			),
		)
		expect(points.creator).toBeNull()
	})

	it("reads a call already in at the price it was made at", () => {
		const points = entryPoints({
			question,
			viewerCall: null,
			creatorCall: {
				conviction: null,
				selections: [
					{
						conviction: 100,
						option: { id: "over" },
						lossRate: 0.96,
						winMult: 1,
						modelHitRate: 0.5,
					},
				],
			},
			draft: undefined,
			alreadyCalled: false,
		})
		expect(points.creator).toEqual({ winLow: 150, winHigh: 150, lose: 144 })
	})

	it("adds a draft to the field as a new call", () => {
		const points = entryPoints({
			question,
			viewerCall: null,
			creatorCall: overCall,
			draft: overDraft,
			alreadyCalled: false,
		})
		expect(points.yours).toEqual(
			challengePointsRange(question, overDraft, true),
		)
		expect(points.creator).toEqual({ winLow: 225, winHigh: 225, lose: 120 })
	})

	it("has nothing for the viewer without a call or a draft", () => {
		const points = entryPoints({
			question,
			viewerCall: null,
			creatorCall: null,
			draft: undefined,
			alreadyCalled: false,
		})
		expect(points).toEqual({ yours: null, creator: null })
	})
})

describe("totalsOf", () => {
	it("sums every hit and every miss, skipping uncalled questions", () => {
		expect(
			totalsOf([
				{ winLow: 10, winHigh: 30, lose: 5 },
				null,
				{ winLow: 20, winHigh: 20, lose: 15 },
			]),
		).toEqual({ best: 50, worst: -20 })
	})

	it("is zero both ways with nothing called", () => {
		expect(totalsOf([null, null])).toEqual({ best: 0, worst: 0 })
	})
})

describe("openPointsBySide", () => {
	const scoring = {
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
	// A call made at its side's current price.
	const priceOf = (optionId: string) => {
		const option = scoring.options.find((o) => o.id === optionId)
		if (!option) throw new Error(`no option ${optionId}`)
		const { lossRate, winMult, modelHitRate } = option
		return { lossRate, winMult, modelHitRate }
	}
	const call = (optionId: string) => ({
		conviction: null,
		selections: [
			{ conviction: 100, option: { id: optionId }, ...priceOf(optionId) },
		],
	})
	const range = (optionId: string) =>
		challengePointsRange(
			scoring,
			{ conviction: null, selections: [{ optionId, conviction: 100 }] },
			false,
		)
	type Entry = Parameters<typeof openPointsBySide>[0][number]
	type Row = Parameters<typeof openPointsBySide>[1][number]
	const entry = (id: string, status: string, creatorCall: unknown) =>
		({ question: { id, status, ...scoring }, creatorCall }) as unknown as Entry
	const row = (id: string, creatorCall: unknown, acceptorCall: unknown) =>
		({ question: { id }, creatorCall, acceptorCall }) as unknown as Row

	it("has nothing riding on a settled or voided question", () => {
		for (const status of ["RESOLVED", "DISPUTED", "VOIDED"]) {
			expect(
				openCallRange(entry("q", status, null), call("over") as never),
			).toBeNull()
		}
	})

	it("sums each side's open calls, falling back to the creator's own call without a row", () => {
		const open = openPointsBySide(
			[
				entry("a", "OPEN", call("over")),
				entry("b", "OPEN", call("under")),
				entry("c", "RESOLVED", call("over")),
			],
			[row("a", call("over"), call("under"))],
		)
		const over = range("over")
		const under = range("under")
		expect(open.creator).toEqual({
			winLow: (over?.winLow ?? 0) + (under?.winLow ?? 0),
			winHigh: (over?.winHigh ?? 0) + (under?.winHigh ?? 0),
			lose: (over?.lose ?? 0) + (under?.lose ?? 0),
		})
		expect(open.acceptor).toEqual(under)
	})
})
