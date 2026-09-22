import { describe, expect, it } from "vitest"
import { athleteInjuryStatus } from "./sync-players"

const athlete = (status: string | null, injury?: string) => ({
	id: "1",
	fullName: "Player",
	...(status
		? { status: { abbreviation: status, type: status, name: `name:${status}` } }
		: {}),
	...(injury ? { injuries: [{ status: injury }] } : {}),
})

describe("athleteInjuryStatus", () => {
	it("leaves a healthy player unflagged", () => {
		expect(athleteInjuryStatus(athlete("active"))).toBeNull()
		expect(athleteInjuryStatus(athlete(null))).toBeNull()
	})

	it("reads the reported designation when ESPN files one", () => {
		expect(athleteInjuryStatus(athlete("active", "Day-To-Day"))).toBe(
			"Day-To-Day",
		)
		expect(athleteInjuryStatus(athlete("active", "Out"))).toBe("Out")
	})

	// ESPN types NFL players on season-ending IR as "day-to-day" - only the
	// injuries record knows better, so it has to win over the status type.
	it("prefers the reported designation over a status type that contradicts it", () => {
		expect(athleteInjuryStatus(athlete("day-to-day", "Injured Reserve"))).toBe(
			"Injured Reserve",
		)
	})

	it("falls back to the status type for an IL stint ESPN files no injury for", () => {
		expect(athleteInjuryStatus(athlete("injured60"))).toBe("name:injured60")
		expect(athleteInjuryStatus(athlete("15-day-il"))).toBe("name:15-day-il")
		expect(athleteInjuryStatus(athlete("suspended"))).toBe("name:suspended")
	})
})
