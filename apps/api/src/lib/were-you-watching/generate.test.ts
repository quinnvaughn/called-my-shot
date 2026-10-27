import { describe, expect, it } from "vitest"
import { defaultStatParser, parseBoxScore } from "../../db/sync/box-score-parse"
import type { EspnGameSummary } from "../../db/sync/espn-client"
import { espnFixture } from "../../test/helpers"
import type { WatchCell, WatchSide } from "./box"
import { buildWatchQuestions } from "./generate"
import { MAX_QUESTIONS, MIN_QUESTIONS, watchLeague } from "./leagues"

// The same trimmed ESPN summaries the box score parser is tested on, turned
// into what loadWatchBox reads back out of the database: every athlete
// linked, under their ESPN id.
type League = "nba" | "nfl" | "mlb" | "nhl"

const cell = (key: string, text: string): WatchCell => {
	const num = defaultStatParser(key)(text)
	const clock = /^(\d+):(\d{2})$/.exec(text)
	return {
		text,
		num: num ?? (clock ? Number(clock[1]) * 60 + Number(clock[2]) : null),
	}
}

const cells = (stats: Map<string, string>) =>
	new Map([...stats].map(([k, v]) => [k, cell(k, v)]))

function sidesFrom(league: League): WatchSide[] {
	const box = parseBoxScore(
		espnFixture<EspnGameSummary>(`${league}-summary.json`),
	)
	return [...box.scoreByEspnTeamId.keys()].map((teamId) => ({
		teamId,
		players: [...box.athletes]
			.filter(([, a]) => a.espnTeamId === teamId)
			.map(([id, a]) => ({
				playerId: id,
				name: a.name ?? id,
				starter: a.starter,
				didNotPlay: a.didNotPlay,
				stats: cells(a.stats),
			})),
		teamBox: cells(box.teamStats.get(teamId) ?? new Map()),
		tableTotals: cells(box.tableTotals.get(teamId) ?? new Map()),
		score: box.scoreByEspnTeamId.get(teamId) ?? null,
		periods: [...(box.periodScores.get(teamId) ?? [])].map(([key, v]) => ({
			key,
			score: Number(v),
		})),
	}))
}

function build(league: League, sides = sidesFrom(league), flip = false) {
	const settings = watchLeague(league)
	if (!settings) throw new Error(league)
	const [a, b] = sides
	if (!a || !b) throw new Error("sides")
	const [team, opp] = flip ? [b, a] : [a, b]
	return buildWatchQuestions({
		gameId: `game-${league}`,
		league: settings,
		team,
		opp,
		teamInfo: { name: "Home Hawks", abbreviation: "HOM" },
		oppInfo: { name: "Away Owls", abbreviation: "AWY" },
		statusDetail: null,
	})
}

describe("buildWatchQuestions", () => {
	it.each([
		"nba",
		"nfl",
		"mlb",
		"nhl",
	] as const)("fills a %s quiz that ends on the final score", (league) => {
		const questions = build(league)
		expect(questions).not.toBeNull()
		expect(questions?.length).toBeGreaterThanOrEqual(MIN_QUESTIONS)
		expect(questions?.length).toBeLessThanOrEqual(MAX_QUESTIONS)
		expect(questions?.at(-1)?.template).toBe("final_score")
	})

	it.each([
		"nba",
		"nfl",
		"mlb",
		"nhl",
	] as const)("gives every %s question four different choices, one of them right", (league) => {
		for (const flip of [false, true]) {
			for (const q of build(league, sidesFrom(league), flip) ?? []) {
				expect(q.options).toHaveLength(4)
				expect(new Set(q.options.map((o) => o.label)).size).toBe(4)
				expect(q.answer).toBeGreaterThanOrEqual(0)
				expect(q.answer).toBeLessThan(4)
			}
		}
	})

	it("builds the same quiz from the same box score", () => {
		expect(build("nba")).toEqual(build("nba"))
	})

	it("names the leader a leader question says", () => {
		const [home] = sidesFrom("nba")
		const question = build("nba")?.find(
			(q) => q.template === "nba.leader.points",
		)
		const top = [...(home?.players ?? [])].sort(
			(a, b) =>
				(b.stats.get("points")?.num ?? 0) - (a.stats.get("points")?.num ?? 0),
		)[0]
		expect(question?.options[question.answer]?.playerId).toBe(top?.playerId)
	})

	it("skips a leader question when two players tie for the most", () => {
		const sides = sidesFrom("nba")
		const home = sides[0]
		if (!home) throw new Error("home")
		for (const [i, player] of home.players.entries()) {
			player.stats.set("rebounds", { text: "5", num: i < 2 ? 9 : 2 })
		}
		const templates = build("nba", sides)?.map((q) => q.template)
		expect(templates).not.toContain("nba.leader.rebounds")
	})

	it("only asks who came off the bench when the feed said who started", () => {
		const sides = sidesFrom("nba")
		for (const side of sides) for (const p of side.players) p.starter = null
		const templates = build("nba", sides)?.map((q) => q.template)
		expect(templates).not.toContain("nba.bench")
		expect(templates).toContain("nba.starter_line")
	})

	it("never reads MLB's season-to-date rate columns", () => {
		const sides = sidesFrom("mlb")
		const rates = [
			"batting.avg",
			"batting.onBasePct",
			"batting.slugAvg",
			"pitching.ERA",
		]
		const read = new Set<string>()
		for (const side of sides) {
			for (const player of side.players) {
				const stats = player.stats
				player.stats = new Proxy(stats, {
					get(target, prop) {
						if (prop === "get")
							return (key: string) => {
								read.add(key)
								return target.get(key)
							}
						const value = Reflect.get(target, prop, target)
						return typeof value === "function" ? value.bind(target) : value
					},
				})
			}
		}
		build("mlb", sides)
		expect(rates.filter((key) => read.has(key))).toEqual([])
	})

	it("gives up on a box score that can't fill a quiz", () => {
		const sides = sidesFrom("nba")
		for (const side of sides) side.players = side.players.slice(0, 2)
		expect(build("nba", sides)).toBeNull()
	})

	it("tags every final score the same way when the game went to overtime", () => {
		const settings = watchLeague("nhl")
		const [team, opp] = sidesFrom("nhl")
		if (!settings || !team || !opp) throw new Error("setup")
		const questions = buildWatchQuestions({
			gameId: "ot",
			league: settings,
			team,
			opp,
			teamInfo: { name: "Home Hawks", abbreviation: "HOM" },
			oppInfo: { name: "Away Owls", abbreviation: "AWY" },
			statusDetail: "Final/OT",
		})
		const final = questions?.at(-1)
		expect(final?.options.every((o) => o.label.endsWith(" (OT)"))).toBe(true)
	})
})
