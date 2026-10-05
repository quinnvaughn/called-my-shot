import {
	AUTO_RESOLVE_STATS,
	UNSTORED_GAME_LEADER_STATS,
} from "@called-my-shot/schemas"
import { describe, expect, it } from "vitest"
import { parseMadeAttempted } from "../../db/sync/box-score-parse"
import { GAME_EXTRACTORS } from "./registry"

type GameKey = keyof typeof GAME_EXTRACTORS

// The game stats whose value genuinely isn't a single cell of a stored box
// score, and so can't carry a `source`. Each one is here for one of three
// reasons, all spelled out on the factory that builds it in registry.ts:
// computed from several cells (ERA, WHIP), not a stat cell at all (Saves, read
// off the pitching decision note), or a column ESPN reports season-to-date
// rather than per-game (the four mlbBatterGameStat ones, which is the trap
// this whole list exists to keep visible).
//
// The final score used to be here too. It isn't a box-score cell either, but
// it is now stored as a one-key team stat (scope "final_score"), so a points
// question reads it the same way every other team stat is read.
//
// Adding a key here is a claim that stat context cannot be derived from
// stored box-score rows. Anything not listed must be readable from one, which
// is what stops a newly added league quietly shipping without context.
const NO_RAW_BOX_COLUMN = new Set<GameKey>([
	"mlb:game:player:Stolen Bases",
	"mlb:game:player:Batting Average",
	"mlb:game:player:On-Base Percentage",
	"mlb:game:player:Slugging Percentage",
	"mlb:game:player:Saves",
	"mlb:game:player:ERA",
	"mlb:game:player:WHIP",
])

const gameEntries = Object.entries(GAME_EXTRACTORS) as [
	GameKey,
	(typeof GAME_EXTRACTORS)[GameKey],
][]

describe("GAME_EXTRACTORS box stat sources", () => {
	it("gives every game stat a source unless it's a documented exception", () => {
		const missing = gameEntries
			.filter(([key, e]) => !e.source && !NO_RAW_BOX_COLUMN.has(key))
			.map(([key]) => key)

		expect(missing).toEqual([])
	})

	it("keeps the exception list from going stale", () => {
		const nowSourced = [...NO_RAW_BOX_COLUMN].filter(
			(key) => GAME_EXTRACTORS[key].source,
		)

		expect(nowSourced).toEqual([])
	})

	it("reads a made-attempted pair through the pair parser", () => {
		const source = GAME_EXTRACTORS["nba:game:player:3-Pointers Made"].source

		expect(source).toEqual({
			origin: "athlete",
			keys: ["threePointFieldGoalsMade-threePointFieldGoalsAttempted"],
			parse: parseMadeAttempted,
		})
	})

	it("carries the raw ESPN key, prefixed where the box score prefixes it", () => {
		expect(GAME_EXTRACTORS["nba:game:player:Points"].source?.keys).toEqual([
			"points",
		])
		expect(GAME_EXTRACTORS["mlb:game:player:Hits"].source?.keys).toEqual([
			"batting.hits",
		])
		expect(
			GAME_EXTRACTORS["nfl:game:player:Passing Yards"].source?.keys,
		).toEqual(["passing.passingYards"])
	})

	it("names every key a summed stat adds up", () => {
		expect(
			GAME_EXTRACTORS["nfl:game:player:Rushing + Receiving Yards"].source?.keys,
		).toEqual(["rushing.rushingYards", "receiving.receivingYards"])
		expect(
			GAME_EXTRACTORS["nfl:game:player:Passing + Rushing Touchdowns"].source
				?.keys,
		).toEqual(["passing.passingTouchdowns", "rushing.rushingTouchdowns"])
	})

	it("separates the three key namespaces", () => {
		// The same stat reads from a different map at team level than at player
		// level, and NBA rebounds are the case where the keys differ too.
		expect(GAME_EXTRACTORS["nba:game:player:Rebounds"].source).toMatchObject({
			origin: "athlete",
			keys: ["rebounds"],
		})
		expect(GAME_EXTRACTORS["nba:game:team:Rebounds"].source).toMatchObject({
			origin: "team_box",
			keys: ["totalRebounds"],
		})
		expect(GAME_EXTRACTORS["nfl:game:team:Receptions"].source).toMatchObject({
			origin: "player_table_total",
		})
	})

	it("never gives one origin and key two different parsers", () => {
		const parserBySource = new Map<string, (raw?: string) => number | null>()
		const conflicts: string[] = []

		for (const [, extractor] of gameEntries) {
			if (!extractor.source) continue
			for (const key of extractor.source.keys) {
				const id = `${extractor.source.origin}:${key}`
				const seen = parserBySource.get(id)
				if (!seen) parserBySource.set(id, extractor.source.parse)
				else if (seen !== extractor.source.parse) conflicts.push(id)
			}
		}

		expect(conflicts).toEqual([])
	})
})

describe("UNSTORED_GAME_LEADER_STATS", () => {
	it("lists exactly the leader stats a team's season can't be added up from", () => {
		const unstored = gameEntries
			.filter(
				([key, e]) =>
					e.subject === "player" && AUTO_RESOLVE_STATS[key].leader && !e.source,
			)
			.map(([key]) => key)

		expect([...UNSTORED_GAME_LEADER_STATS].sort()).toEqual(unstored.sort())
	})
})
