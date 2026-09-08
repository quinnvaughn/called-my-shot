import { questionShapeSchema } from "@called-my-shot/schemas"
import { isSeasonLongShape } from "@called-my-shot/scoring"
import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderPanel } from "../test-utils"
import { ShapePanelFor } from "./shape-panel-for"

const ALL_SHAPES = questionShapeSchema.options

// This is the invariant selectType's gameId clearing rests on: it clears the
// game for exactly the season-long shapes, which is only correct if those are
// exactly the shapes with no game picker. If a future shape breaks the pairing,
// a stale gameId rides along invisibly and the API derives locksAt from it -
// so the coupling is asserted here rather than left as a comment.
describe("a shape's panel renders a game picker iff the shape is not season-long", () => {
	it.each(ALL_SHAPES)("%s", (shape) => {
		renderPanel(<ShapePanelFor shape={shape} />, {
			// A league is picked, since StatPanel hides its fields without one.
			values: { shape, leagueId: "l", sportId: "s" },
		})

		const hasGamePicker = screen.queryByText("Game") !== null
		expect(hasGamePicker).toBe(!isSeasonLongShape(shape))
	})
})

describe("every shape renders a panel", () => {
	it.each(ALL_SHAPES)("%s renders something", (shape) => {
		const { container } = renderPanel(<ShapePanelFor shape={shape} />, {
			values: { shape, leagueId: "l", sportId: "s" },
		})
		expect(container).not.toBeEmptyDOMElement()
	})
})
