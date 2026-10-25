import { describe, expect, it } from "vitest"
import type { PushPreferenceType } from "#/graphql/generated/graphql"
import { PUSH_GROUPS } from "./push-groups"

// Every member of the generated enum, kept honest by the Record: a type added
// to the schema fails to compile here until it's listed.
const ALL_TYPES: Record<PushPreferenceType, true> = {
	ALL: true,
	CALL_RESOLVED: true,
	CALL_VOIDED: true,
	CHAIN_CALLED_OFF: true,
	CHAIN_COMMENTED: true,
	CHAIN_LINK_DECIDED: true,
	CHAIN_LINK_REQUESTED: true,
	CHAIN_MEMBER_LEFT: true,
	CHAIN_SETTLED: true,
	CHALLENGE_ACCEPTED: true,
	CHALLENGE_GLOATED: true,
	CHALLENGE_POSTED_TO_GROUP: true,
	CHALLENGE_SETTLED: true,
	COMMENT_REPLIED: true,
	DISPUTE_FILED: true,
	DISPUTE_OVERTURNED: true,
	DISPUTE_UPHELD: true,
	GAME_REMINDER: true,
	GAME_RESOLVED: true,
	GROUP_MEMBER_JOINED: true,
	GROUP_PINS_EXPIRED: true,
	LIKES_MILESTONE: true,
	POST_COMMENTED: true,
	PRESSER_ANSWERED: true,
	PRESSER_QUESTION_RECEIVED: true,
	QUESTION_SHARED_TO_GROUP: true,
	QUESTION_VOIDED: true,
	REDO_EARNED: true,
	STREAK_MILESTONE: true,
	STREAK_PERSONAL_BEST: true,
	STREAK_SNAPPED: true,
	SWEEP_COMPLETED: true,
	USER_FOLLOWED: true,
}

describe("PUSH_GROUPS", () => {
	it("puts every pushed type in exactly one group", () => {
		const grouped = PUSH_GROUPS.flatMap((g) => g.types)
		const pushed = Object.keys(ALL_TYPES).filter(
			(type) =>
				type !== "ALL" &&
				type !== "GROUP_PINS_EXPIRED" &&
				type !== "USER_FOLLOWED" &&
				type !== "LIKES_MILESTONE",
		)
		expect([...grouped].sort()).toEqual(pushed.sort())
	})
})
