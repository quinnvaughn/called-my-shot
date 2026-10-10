import { describe, expect, it } from "vitest"
import {
	completedCount,
	isOnboardingComplete,
	type OnboardingFacts,
	onboardingSteps,
} from "./onboarding-steps"

// A brand new, fully verified account: nothing done, nothing restricted.
const FRESH: OnboardingFacts = {
	hasCalled: false,
	hasViewedLeaderboard: false,
	hasGroup: false,
	hasCreatedQuestion: false,
	hasFavoriteTeams: false,
	emailVerified: true,
	questionCreationEnabled: true,
}

function idsOf(facts: Partial<OnboardingFacts>) {
	return onboardingSteps({ ...FRESH, ...facts }).map((s) => s.id)
}

function stepById(facts: Partial<OnboardingFacts>, id: string) {
	return onboardingSteps({ ...FRESH, ...facts }).find((s) => s.id === id)
}

describe("onboardingSteps", () => {
	it("leads with the call, since every other step reads better once you have one", () => {
		expect(idsOf({})[0]).toBe("call")
	})

	it("covers groups and the leaderboard, not just the call form", () => {
		expect(idsOf({})).toContain("group")
		expect(idsOf({})).toContain("leaderboard")
	})

	it("ticks the leaderboard off opening it, not off making a call", () => {
		expect(stepById({ hasViewedLeaderboard: true }, "leaderboard")?.done).toBe(
			true,
		)
		expect(stepById({ hasCalled: true }, "leaderboard")?.done).toBe(false)
	})

	it("ticks teams off having at least one saved", () => {
		expect(stepById({ hasFavoriteTeams: true }, "teams")?.done).toBe(true)
		expect(stepById({}, "teams")?.done).toBe(false)
	})

	it("counts a group somebody else started", () => {
		expect(stepById({ hasGroup: true }, "group")?.done).toBe(true)
	})

	it("only asks for email verification while it is outstanding", () => {
		expect(idsOf({ emailVerified: true })).not.toContain("verify-email")
		expect(idsOf({ emailVerified: false })).toContain("verify-email")
	})

	it("marks posting a question blocked until the email is verified", () => {
		expect(stepById({ emailVerified: false }, "question")?.blockedBy).toBe(
			"verify-email",
		)
		expect(stepById({ emailVerified: true }, "question")?.blockedBy).toBe(
			undefined,
		)
	})

	it("drops the question step for a suspended account rather than dangling it", () => {
		// Unlike an unverified email, this is not something the user can go and
		// clear, so listing it would be a step with no way through.
		expect(idsOf({ questionCreationEnabled: false })).not.toContain("question")
	})

	it("shows an established user most of the list already done", () => {
		const steps = onboardingSteps({
			hasCalled: true,
			hasViewedLeaderboard: true,
			hasGroup: true,
			hasCreatedQuestion: true,
			hasFavoriteTeams: true,
			emailVerified: true,
			questionCreationEnabled: true,
		})

		expect(isOnboardingComplete(steps)).toBe(true)
		expect(completedCount(steps)).toBe(steps.length)
	})

	it("is not complete while anything is outstanding", () => {
		const steps = onboardingSteps({ ...FRESH, hasCalled: true })

		expect(isOnboardingComplete(steps)).toBe(false)
		expect(completedCount(steps)).toBe(1)
	})
})
