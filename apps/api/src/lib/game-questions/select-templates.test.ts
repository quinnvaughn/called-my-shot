import { describe, expect, it } from "vitest"
import { seededRandom, selectGameTemplates, shuffled } from "./select-templates"

type Template = { id: string; shape: string; group?: string }

const team = (id: string): Template => ({
	id,
	shape: "team_stat_numeric_guess",
})
const player = (id: string, group?: string): Template => ({
	id,
	shape: "player_stat_over_under",
	group,
})

const CATALOG = [
	team("team-points"),
	player("points-duel", "points"),
	player("points-line", "points"),
	player("points-leader", "points"),
	player("rebounds-duel", "rebounds"),
	player("rebounds-line", "rebounds"),
	player("assists-line", "assists"),
	player("threes-line", "threes"),
	player("blocks-leader"),
]

const select = (gameId: string, liveTemplateIds: string[] = [], perGame = 3) =>
	selectGameTemplates(CATALOG, {
		gameId,
		perGame,
		liveTemplateIds: new Set(liveTemplateIds),
	}).map((template) => template.id)

const groupOf = (id: string) =>
	CATALOG.find((template) => template.id === id)?.group

describe("seededRandom", () => {
	it("gives the same sequence for the same seed and a different one otherwise", () => {
		const draw = (seed: string) => {
			const random = seededRandom(seed)
			return [random(), random(), random()]
		}
		expect(draw("game-1")).toEqual(draw("game-1"))
		expect(draw("game-1")).not.toEqual(draw("game-2"))
		for (const value of draw("game-3")) {
			expect(value).toBeGreaterThanOrEqual(0)
			expect(value).toBeLessThan(1)
		}
	})
})

describe("shuffled", () => {
	it("keeps every item and leaves the input alone", () => {
		const items = [1, 2, 3, 4, 5]
		const result = shuffled(items, seededRandom("seed"))
		expect([...result].sort()).toEqual(items)
		expect(items).toEqual([1, 2, 3, 4, 5])
	})
})

describe("selectGameTemplates", () => {
	it("picks the same templates for the same game", () => {
		expect(select("game-1")).toEqual(select("game-1"))
	})

	it("picks different templates across games", () => {
		const selections = new Set(
			Array.from({ length: 20 }, (_, i) => select(`game-${i}`).join(",")),
		)
		expect(selections.size).toBeGreaterThan(1)
	})

	it("always includes team templates, plus perGame player templates at most one per group", () => {
		for (let i = 0; i < 20; i++) {
			const ids = select(`game-${i}`)
			expect(ids).toContain("team-points")
			const players = ids.filter((id) => id !== "team-points")
			expect(players).toHaveLength(3)
			const groups = players.map(groupOf).filter(Boolean)
			expect(new Set(groups).size).toBe(groups.length)
		}
	})

	it("keeps a template with a live question, even past the quota or a taken group", () => {
		const ids = select("game-1", ["points-duel", "points-line"], 1)
		expect(ids).toEqual(["team-points", "points-duel", "points-line"])
	})

	it("keeps its earlier picks once some of them have gone live", () => {
		for (let i = 0; i < 20; i++) {
			const first = select(`game-${i}`)
			const [, live] = first
			if (!live) throw new Error("expected a player template")
			expect(select(`game-${i}`, [live])).toEqual(first)
		}
	})

	it("returns templates in catalog order", () => {
		const ids = select("game-1")
		const order = CATALOG.map((template) => template.id)
		expect(ids).toEqual(
			[...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
		)
	})
})
