import { describe, expect, it } from "vitest"
import {
	type QuestionSetRailRow,
	questionSetRailSummary,
} from "./question-set-rail"

function row(
	state: QuestionSetRailRow["state"],
	totalPoints: number | null,
): QuestionSetRailRow {
	return {
		questionId: crypto.randomUUID(),
		questionTitle: "Q",
		questionStatus: "OPEN",
		locksAt: new Date().toISOString(),
		label: "Q",
		section: null,
		state,
		call:
			state === "uncalled" ? null : { pick: "Yes", totalPoints, payout: null },
		live: null,
	}
}

describe("questionSetRailSummary", () => {
	it("counts extra rows toward the record and points but not the called count", () => {
		const summary = questionSetRailSummary(
			[row("won", 20), row("uncalled", null), row("pending", null)],
			[row("lost", -8), row("pending", null)],
		)
		expect(summary).toEqual({
			calledCount: 2,
			questionCount: 3,
			wins: 1,
			losses: 1,
			points: 12,
		})
	})
})
