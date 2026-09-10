import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { groupMembers, groups } from "../../../db/schema"
import {
	futureDate,
	makeCall,
	makeQuestion,
	makeUser,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"

// The launcher reads viewerOnboarding to decide whether to offer the
// walkthrough, and the two timestamps are the only onboarding state the server
// stores. What's pinned here is that the three booleans come from real rows (so
// no step can get stuck outstanding), and that collapsed and dismissed stay
// independent of each other, since the card's whole safety property is that
// folding it away cannot destroy it.

const VIEWER_ONBOARDING = /* GraphQL */ `
	query ViewerOnboarding {
		viewerOnboarding {
			__typename
			... on ViewerOnboarding {
				hasCalled
				hasGroup
				hasCreatedQuestion
				suggestedQuestion { id }
			}
		}
	}
`

const ME_ONBOARDING = /* GraphQL */ `
	query Me {
		me { onboardingDismissedAt onboardingCollapsedAt }
	}
`

const SET_COLLAPSED = /* GraphQL */ `
	mutation SetOnboardingCollapsed($collapsed: Boolean!) {
		setOnboardingCollapsed(collapsed: $collapsed) {
			__typename
			... on User { onboardingCollapsedAt }
		}
	}
`

const DISMISS_ONBOARDING = /* GraphQL */ `
	mutation DismissOnboarding {
		dismissOnboarding {
			__typename
			... on User { onboardingDismissedAt }
		}
	}
`

const RESTART_ONBOARDING = /* GraphQL */ `
	mutation RestartOnboarding {
		restartOnboarding {
			__typename
			... on User { onboardingDismissedAt }
		}
	}
`

describe("viewerOnboarding", () => {
	it("reports no call for a brand new account", async () => {
		const user = await makeUser()

		const data = await expectData<{
			viewerOnboarding: { hasCalled: boolean }
		}>(VIEWER_ONBOARDING, { as: user })

		expect(data.viewerOnboarding.hasCalled).toBe(false)
	})

	it("flips hasCalled once the user has actually called something", async () => {
		const user = await makeUser()
		const question = await makeQuestion({ locksAt: futureDate(4) })
		await makeCall(question.id, user.id)

		const data = await expectData<{
			viewerOnboarding: { hasCalled: boolean }
		}>(VIEWER_ONBOARDING, { as: user })

		expect(data.viewerOnboarding.hasCalled).toBe(true)
	})

	it("does not count another user's call as this user's", async () => {
		const user = await makeUser()
		const other = await makeUser()
		const question = await makeQuestion({ locksAt: futureDate(4) })
		await makeCall(question.id, other.id)

		const data = await expectData<{
			viewerOnboarding: { hasCalled: boolean }
		}>(VIEWER_ONBOARDING, { as: user })

		expect(data.viewerOnboarding.hasCalled).toBe(false)
	})

	it("hands back a question to call, and null when nothing is open", async () => {
		const user = await makeUser()

		const empty = await expectData<{
			viewerOnboarding: { suggestedQuestion: { id: string } | null }
		}>(VIEWER_ONBOARDING, { as: user })
		expect(empty.viewerOnboarding.suggestedQuestion).toBeNull()

		const question = await makeQuestion({
			shape: "team_vs_team",
			isOfficial: true,
			locksAt: futureDate(3),
		})

		const withQuestion = await expectData<{
			viewerOnboarding: { suggestedQuestion: { id: string } | null }
		}>(VIEWER_ONBOARDING, { as: user })
		expect(withQuestion.viewerOnboarding.suggestedQuestion?.id).toBe(
			question.id,
		)
	})

	it("counts a group the user only joined, not just ones they started", async () => {
		const owner = await makeUser()
		const user = await makeUser()
		const [group] = await db
			.insert(groups)
			.values({ name: "Test group", createdBy: owner.id })
			.returning()

		const before = await expectData<{
			viewerOnboarding: { hasGroup: boolean }
		}>(VIEWER_ONBOARDING, { as: user })
		expect(before.viewerOnboarding.hasGroup).toBe(false)

		await db.insert(groupMembers).values({ groupId: group.id, userId: user.id })

		const after = await expectData<{ viewerOnboarding: { hasGroup: boolean } }>(
			VIEWER_ONBOARDING,
			{ as: user },
		)
		expect(after.viewerOnboarding.hasGroup).toBe(true)
	})

	it("reports hasCreatedQuestion only for questions this user authored", async () => {
		const user = await makeUser()
		const other = await makeUser()
		await makeQuestion({ creatorId: other.id })

		const before = await expectData<{
			viewerOnboarding: { hasCreatedQuestion: boolean }
		}>(VIEWER_ONBOARDING, { as: user })
		expect(before.viewerOnboarding.hasCreatedQuestion).toBe(false)

		await makeQuestion({ creatorId: user.id })

		const after = await expectData<{
			viewerOnboarding: { hasCreatedQuestion: boolean }
		}>(VIEWER_ONBOARDING, { as: user })
		expect(after.viewerOnboarding.hasCreatedQuestion).toBe(true)
	})

	it("refuses a signed-out viewer", async () => {
		const result = await execute(VIEWER_ONBOARDING, { as: null })

		expect(
			(result.data as { viewerOnboarding: { __typename: string } })
				.viewerOnboarding.__typename,
		).toBe("AuthenticationError")
	})
})

describe("the onboarding dismissal timestamp", () => {
	it("starts null, which is what makes the checklist appear", async () => {
		const user = await makeUser()

		const data = await expectData<{
			me: { onboardingDismissedAt: string | null }
		}>(ME_ONBOARDING, { as: user })

		expect(data.me.onboardingDismissedAt).toBeNull()
	})

	it("dismissOnboarding stamps it", async () => {
		const user = await makeUser()

		const data = await expectData<{
			dismissOnboarding: { onboardingDismissedAt: string | null }
		}>(DISMISS_ONBOARDING, { as: user })

		expect(data.dismissOnboarding.onboardingDismissedAt).not.toBeNull()
	})

	it("restartOnboarding clears it, putting the checklist back", async () => {
		const user = await makeUser()
		await expectData(DISMISS_ONBOARDING, { as: user })

		const data = await expectData<{
			restartOnboarding: { onboardingDismissedAt: string | null }
		}>(RESTART_ONBOARDING, { as: user })

		expect(data.restartOnboarding.onboardingDismissedAt).toBeNull()
	})

	it("collapses and expands without ever touching the dismissal", async () => {
		const user = await makeUser()

		const collapsed = await expectData<{
			setOnboardingCollapsed: { onboardingCollapsedAt: string | null }
		}>(SET_COLLAPSED, { as: user, variables: { collapsed: true } })
		expect(
			collapsed.setOnboardingCollapsed.onboardingCollapsedAt,
		).not.toBeNull()

		// Collapsing is a display choice. Someone who folds the card away has
		// not asked for it to be gone, and the card has to come back on its own
		// for anyone who expands it again.
		const stillHere = await expectData<{
			me: { onboardingDismissedAt: string | null }
		}>(ME_ONBOARDING, { as: user })
		expect(stillHere.me.onboardingDismissedAt).toBeNull()

		const expanded = await expectData<{
			setOnboardingCollapsed: { onboardingCollapsedAt: string | null }
		}>(SET_COLLAPSED, { as: user, variables: { collapsed: false } })
		expect(expanded.setOnboardingCollapsed.onboardingCollapsedAt).toBeNull()
	})

	it("restartOnboarding unfolds the card as well as restoring it", async () => {
		const user = await makeUser()
		await expectData(SET_COLLAPSED, {
			as: user,
			variables: { collapsed: true },
		})
		await expectData(DISMISS_ONBOARDING, { as: user })

		await expectData(RESTART_ONBOARDING, { as: user })

		// Replay that brought the card back still folded shut would look like a
		// menu item that did nothing.
		const data = await expectData<{
			me: {
				onboardingDismissedAt: string | null
				onboardingCollapsedAt: string | null
			}
		}>(ME_ONBOARDING, { as: user })
		expect(data.me.onboardingDismissedAt).toBeNull()
		expect(data.me.onboardingCollapsedAt).toBeNull()
	})

	it("refuses both to a signed-out viewer", async () => {
		for (const mutation of [DISMISS_ONBOARDING, RESTART_ONBOARDING]) {
			const result = await execute(mutation, { as: null })
			const payload = Object.values(
				result.data as Record<string, { __typename: string }>,
			)[0]
			expect(payload?.__typename).toBe("AuthenticationError")
		}
	})
})
