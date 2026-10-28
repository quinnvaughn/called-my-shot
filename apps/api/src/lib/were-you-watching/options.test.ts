import { describe, expect, it } from "vitest"
import { seededRandom } from "../game-questions/select-templates"
import { lineQuestion } from "./options"

const numbers = (label: string) => (label.match(/\d+/g) ?? []).map(Number)

describe("lineQuestion", () => {
	it("keeps every line at least half a spread apart in two numbers", () => {
		for (let seed = 0; seed < 50; seed++) {
			const question = lineQuestion({
				template: "nba.starter_line",
				prompt: "What was the line?",
				values: [16, 5, 6],
				spreads: [8, 5, 5],
				format: ([p, r, a]) => `${p} PTS, ${r} REB, ${a} AST`,
				rng: seededRandom(`line:${seed}`),
				reveal: "",
			})
			expect(question).not.toBeNull()
			const lines = question?.options.map((o) => numbers(o.label)) ?? []
			for (const [i, a] of lines.entries()) {
				for (const b of lines.slice(i + 1)) {
					const apart = [4, 3, 3].filter(
						(gap, k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) >= gap,
					)
					expect(apart.length).toBeGreaterThanOrEqual(2)
				}
			}
		}
	})
})
