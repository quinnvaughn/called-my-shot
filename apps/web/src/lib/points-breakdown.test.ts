import { describe, expect, it } from "vitest"
import {
	biggestSwing,
	columnWidths,
	type PointsRow,
	type PointsView,
	recordText,
} from "./points-breakdown"

function row(overrides: Partial<PointsRow> & { key: string }): PointsRow {
	return {
		label: overrides.key,
		netPoints: 0,
		wins: null,
		losses: null,
		returnPct: null,
		...overrides,
	}
}

describe("biggestSwing", () => {
	it("reaches into nested and pinned rows, on either side of zero", () => {
		const views: PointsView[] = [
			{
				label: "Leagues",
				rows: [
					row({
						key: "nba",
						netPoints: 40,
						children: [row({ key: "lakers", netPoints: -75 })],
					}),
				],
				pinned: [row({ key: "bonuses", netPoints: 60 })],
			},
		]
		expect(biggestSwing(views)).toBe(75)
	})

	it("never drops below 1, so an empty card doesn't divide by zero", () => {
		expect(biggestSwing([])).toBe(1)
		expect(biggestSwing([{ label: "Empty", rows: [row({ key: "a" })] }])).toBe(
			1,
		)
	})
})

describe("recordText", () => {
	it("is blank for a row no call earned", () => {
		expect(recordText(row({ key: "bonuses" }))).toBe("")
	})
})

describe("columnWidths", () => {
	it("sizes each column to its longest value across every view", () => {
		const views: PointsView[] = [
			{
				label: "Leagues",
				rows: [
					row({ key: "nba", netPoints: 1250, wins: 3, losses: 1 }),
					row({ key: "bonuses", netPoints: 8 }),
				],
			},
			{
				label: "Types",
				rows: [
					row({
						key: "props",
						netPoints: -5,
						wins: 12,
						losses: 10,
						returnPct: -4.4,
					}),
				],
			},
		]
		// "+1250", "12–10", "−4%"
		expect(columnWidths(views)).toEqual({ points: 5, record: 5, ret: 3 })
	})
})
