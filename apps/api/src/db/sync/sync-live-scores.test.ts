import { describe, expect, it } from "vitest"
import type { EspnScoreboardEvent } from "./espn-client"
import { progressOf } from "./sync-live-scores"

describe("progressOf", () => {
	const competition = (
		status: EspnScoreboardEvent["competitions"][0]["status"],
		outs?: number,
	) =>
		({
			status,
			competitors: [],
			situation: outs === undefined ? undefined : { outs },
		}) as unknown as EspnScoreboardEvent["competitions"][0]

	it("stores the period, clock, ESPN's line and outs of a live game", () => {
		expect(
			progressOf(
				"live",
				competition(
					{
						type: {
							name: "STATUS_IN_PROGRESS",
							state: "in",
							completed: false,
							shortDetail: "Top 7th",
						},
						period: 7,
						clock: 0,
					},
					1,
				),
			),
		).toEqual({ period: 7, clockSeconds: 0, statusDetail: "Top 7th", outs: 1 })
	})

	it("stores nothing before a game starts", () => {
		expect(
			progressOf(
				"scheduled",
				competition({
					type: { name: "STATUS_SCHEDULED", state: "pre", completed: false },
					period: 0,
					clock: 0,
				}),
			),
		).toEqual({
			period: null,
			clockSeconds: null,
			statusDetail: null,
			outs: null,
		})
	})
})
