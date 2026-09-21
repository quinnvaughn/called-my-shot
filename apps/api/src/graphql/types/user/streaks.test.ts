import { describe, expect, it } from "vitest"
import type { User } from "../../../db/schema"
import { makeLeague, makeStreak, makeUser } from "../../../test/factories"
import { expectData } from "../../../test/graphql"

// streaks and coldStreaks are separate fields rather than one filtered two
// ways: a track that has only ever missed has a bestLength of 0, so it can
// never clear the minimum streaks lists by.

const PROFILE = /* GraphQL */ `
	query Profile($username: String!) {
		userByUsername(username: $username) {
			streaks { currentLength bestLength }
			coldStreaks { currentColdLength worstColdLength familyLabel }
		}
	}
`

type Profile = {
	userByUsername: {
		streaks: { currentLength: number; bestLength: number }[]
		coldStreaks: {
			currentColdLength: number
			worstColdLength: number
			familyLabel: string
		}[]
	}
}

const profileOf = (user: User) =>
	expectData<Profile>(PROFILE, { variables: { username: user.username } })

describe("User.coldStreaks", () => {
	it("lists a track that has only ever missed, which streaks can't", async () => {
		const user = await makeUser()
		const league = await makeLeague()
		await makeStreak({
			userId: user.id,
			leagueId: league.id,
			lastSettledAt: new Date(),
			currentColdLength: 4,
			worstColdLength: 4,
		})

		const { userByUsername: profile } = await profileOf(user)
		expect(profile.streaks).toEqual([])
		expect(profile.coldStreaks).toEqual([
			{ currentColdLength: 4, worstColdLength: 4, familyLabel: "Winners" },
		])
	})

	it("leaves out a track whose current cold run is below the minimum", async () => {
		const user = await makeUser()
		const league = await makeLeague()
		// One miss after a long run: the run is worth listing, the miss isn't.
		await makeStreak({
			userId: user.id,
			leagueId: league.id,
			lastSettledAt: new Date(),
			bestLength: 6,
			currentColdLength: 1,
			worstColdLength: 1,
		})

		const { userByUsername: profile } = await profileOf(user)
		expect(profile.streaks).toEqual([{ currentLength: 0, bestLength: 6 }])
		expect(profile.coldStreaks).toEqual([])
	})
})
