import { describe, expect, it } from "vitest"
import { leaveConsequence } from "./leave-group"

const member = (
	username: string,
	role: "ADMIN" | "MEMBER",
	joinedAt: string,
) => ({ role, joinedAt, user: { username } })

describe("leaveConsequence", () => {
	it("deletes the group when the last member leaves", () => {
		const viewer = member("sam", "ADMIN", "2026-01-01")
		expect(leaveConsequence("Sunday Crew", viewer, [])).toEqual({
			body: "You're the only member, so leaving deletes Sunday Crew.",
			confirmLabel: "Leave and delete",
		})
	})

	it("names the longest-standing member as the next admin", () => {
		const viewer = member("sam", "ADMIN", "2026-01-01")
		const others = [
			member("newer", "MEMBER", "2026-03-01"),
			member("oldest", "MEMBER", "2026-02-01"),
		]
		const result = leaveConsequence("Sunday Crew", viewer, others)
		expect(result.body).toContain("@oldest becomes admin")
		expect(result.confirmLabel).toBe("Leave group")
	})

	it("hands nothing over while another admin stays", () => {
		const viewer = member("sam", "ADMIN", "2026-01-01")
		const others = [member("kim", "ADMIN", "2026-02-01")]
		expect(leaveConsequence("Sunday Crew", viewer, others).body).toBe(
			"You'll drop off Sunday Crew's leaderboard and your invite link stops working. Anyone in the group can invite you back.",
		)
	})

	it("hands nothing over when a member leaves", () => {
		const viewer = member("sam", "MEMBER", "2026-01-01")
		const others = [member("kim", "MEMBER", "2026-02-01")]
		expect(leaveConsequence("Sunday Crew", viewer, others).body).not.toContain(
			"becomes admin",
		)
	})
})
