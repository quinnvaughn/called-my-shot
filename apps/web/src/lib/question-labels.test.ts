import { SHAPE_FAMILIES } from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import {
	questionShapeFamily,
	questionShapeIcon,
	questionShapeLabel,
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
