import { describe, expect, it } from "vitest"
import { isPromptCoolingDown, nextPromptAt } from "./cooldown"

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 13)

describe("push card cooldown", () => {
	it("shows the card to someone who has never closed it", () => {
		expect(isPromptCoolingDown(null, NOW)).toBe(false)
	})

	it("waits longer after each dismissal", () => {
		expect(nextPromptAt({ count: 1, lastAt: NOW })).toBe(NOW + 7 * DAY)
		expect(nextPromptAt({ count: 2, lastAt: NOW })).toBe(NOW + 30 * DAY)
		expect(nextPromptAt({ count: 3, lastAt: NOW })).toBe(NOW + 90 * DAY)
		expect(isPromptCoolingDown({ count: 1, lastAt: NOW }, NOW + 6 * DAY)).toBe(
			true,
		)
		expect(isPromptCoolingDown({ count: 1, lastAt: NOW }, NOW + 7 * DAY)).toBe(
			false,
		)
	})

	it("stops asking once it has been closed four times", () => {
		expect(nextPromptAt({ count: 4, lastAt: NOW })).toBeNull()
		expect(
			isPromptCoolingDown({ count: 4, lastAt: NOW }, NOW + 365 * DAY),
		).toBe(true)
	})
})
