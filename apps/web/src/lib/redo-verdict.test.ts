import { describe, expect, it } from "vitest"
import { type RedoPanelData, redoVerdict } from "./redo-verdict"

function redo(
	originalWasCorrect: boolean | null,
	currentIsWin: boolean | null,
): RedoPanelData {
	return {
		originalCalledAt: "2026-10-01T18:00:00Z",
		redoneAt: "2026-10-01T19:00:00Z",
		originalPickLabel: "Over 24.5",
		currentPickLabel: "Under 24.5",
		originalCaseText: null,
		originalWasCorrect,
		currentIsWin,
	}
}

describe("redoVerdict", () => {
	it("says nothing until the question settles", () => {
		expect(redoVerdict(redo(null, null))).toBeNull()
		expect(redoVerdict(redo(true, null))).toBeNull()
		expect(redoVerdict(redo(null, false))).toBeNull()
	})

	it("names each settled outcome", () => {
		expect(redoVerdict(redo(true, false))).toBe("Should have stuck with it.")
		expect(redoVerdict(redo(false, true))).toBe("Saved by the redo.")
		expect(redoVerdict(redo(true, true))).toBe("Right either way.")
		expect(redoVerdict(redo(false, false))).toBe("Wrong either way.")
	})
})
