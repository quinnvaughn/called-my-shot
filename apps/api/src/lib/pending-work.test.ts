import { beforeEach, describe, expect, it } from "vitest"
import { clearPendingForTests, markPending, takePending } from "./pending-work"
import { MINUTE_MS } from "./time"

const NOW = new Date("2026-10-07T18:00:00Z")
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs)

beforeEach(() => {
	clearPendingForTests()
})

describe("takePending", () => {
	it("is false with nothing marked", () => {
		expect(takePending("analytics", NOW)).toBe(false)
	})

	it("is true once per mark", () => {
		markPending("analytics", NOW)
		expect(takePending("analytics", NOW)).toBe(true)
		expect(takePending("analytics", NOW)).toBe(false)
	})

	it("keeps each kind separate", () => {
		markPending("analytics", NOW)
		expect(takePending("season-start", NOW)).toBe(false)
		expect(takePending("analytics", NOW)).toBe(true)
	})

	it("holds a mark until it is old enough, counting from the first", () => {
		markPending("digests", NOW)
		markPending("digests", at(10 * MINUTE_MS))
		expect(takePending("digests", at(14 * MINUTE_MS), 15 * MINUTE_MS)).toBe(
			false,
		)
		expect(takePending("digests", at(15 * MINUTE_MS), 15 * MINUTE_MS)).toBe(
			true,
		)
	})
})
