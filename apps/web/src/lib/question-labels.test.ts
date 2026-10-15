import { questionShapeSchema } from "@called-my-shot/schemas"
import { SHAPE_FAMILIES } from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import {
	fieldAccuracyPctFor,
	questionShapeFamily,
	questionShapeIcon,
	questionShapeLabel,
	toAwardVerb,
	toCallShape,
	toQuestionShape,
	toleranceLabel,
	toStatAggregation,
} from "./question-labels"

// Both maps below are derived from @called-my-shot/scoring's snake_case
// Records by upcasing each key, and the cast that gives each one a Record
// type can't check that the result actually covers the GraphQL enum. If the
// two naming conventions ever stop lining up, a lookup returns undefined
// instead of failing the build, and a shape quietly falls out of every filter,
// picker and breakdown that reads it. questionShapeIcon is a real exhaustive
// Record over QuestionShape, so its keys are the enum.
const shapes = () => Object.keys(questionShapeIcon).sort()

describe("questionShapeFamily", () => {
	it("covers every shape the GraphQL enum has", () => {
		expect(Object.keys(questionShapeFamily).sort()).toStrictEqual(shapes())
		for (const shape of shapes()) {
			expect(SHAPE_FAMILIES).toContain(
				questionShapeFamily[shape as keyof typeof questionShapeFamily],
			)
		}
	})
})

describe("questionShapeLabel", () => {
	it("covers every shape the GraphQL enum has, with real text", () => {
		expect(Object.keys(questionShapeLabel).sort()).toStrictEqual(shapes())
		for (const shape of shapes()) {
			const label = questionShapeLabel[shape as keyof typeof questionShapeLabel]
			expect(label).toBeTruthy()
			// A key that slipped through the casing conversion would surface as
			// the raw enum name rather than a label.
			expect(label).not.toBe(shape)
		}
	})

	it("still reads the way the picker expects", () => {
		expect(questionShapeLabel.TEAM_VS_TEAM).toBe("Team vs Team")
		expect(questionShapeLabel.PLAYER_STAT_OVER_UNDER).toBe(
			"Player Game Over/Under",
		)
		expect(questionShapeLabel.YES_NO_PROP).toBe("Yes/No")
	})
})

describe("toCallShape / toQuestionShape", () => {
	it("converts between the GraphQL enum and the lowercase shape", () => {
		expect(toCallShape("PLAYER_STAT_OVER_UNDER")).toBe("player_stat_over_under")
		expect(toQuestionShape("yes_no_prop")).toBe("YES_NO_PROP")
	})

	it("round-trips every shape the schema knows", () => {
		for (const shape of questionShapeSchema.options) {
			const upper = toQuestionShape(shape)
			expect(upper).toBe(shape.toUpperCase())
			expect(toCallShape(upper)).toBe(shape)
		}
	})
})

describe("toStatAggregation / toAwardVerb", () => {
	it("maps the form's lowercase values onto the GraphQL enums", () => {
		expect(toStatAggregation("per_game")).toBe("PER_GAME")
		expect(toStatAggregation("total")).toBe("TOTAL")
		expect(toAwardVerb("win")).toBe("WIN")
		expect(toAwardVerb("be")).toBe("BE")
	})
})

describe("toleranceLabel", () => {
	it("writes an absolute band in the stat's own precision", () => {
		expect(toleranceLabel({ mode: "absolute", amount: 3 })).toBe("±3")
		expect(toleranceLabel({ mode: "absolute", amount: 0.5 })).toMatch(/^±0?\.5/)
	})

	it("writes a percentage band against the actual", () => {
		expect(toleranceLabel({ mode: "percentage", pct: 0.15 })).toBe(
			"±15% of actual",
		)
	})
})

describe("fieldAccuracyPctFor", () => {
	const options = [
		{ isCorrect: false, fieldPct: 70 },
		{ isCorrect: true, fieldPct: 30 },
	]

	it("reads the correct option's share on an option-based question", () => {
		expect(
			fieldAccuracyPctFor({
				shape: "PLAYER_STAT_OVER_UNDER",
				numericHitRatePct: 55,
				options,
			}),
		).toBe(30)
	})

	it("reads the hit rate on a numeric guess", () => {
		expect(
			fieldAccuracyPctFor({
				shape: "PLAYER_STAT_NUMERIC_GUESS",
				numericHitRatePct: 12,
				options: [],
			}),
		).toBe(12)
	})

	it("is null with no correct option", () => {
		expect(
			fieldAccuracyPctFor({
				shape: "PLAYER_STAT_OVER_UNDER",
				numericHitRatePct: null,
				options: [{ isCorrect: false, fieldPct: 70 }],
			}),
		).toBeNull()
	})
})
