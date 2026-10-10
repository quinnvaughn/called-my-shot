import { MAX_FAVORITE_TEAMS } from "@called-my-shot/schemas"
import { describe, expect, it } from "vitest"
import { makeLeague, makeTeam, makeUser } from "../../../test/factories"
import { expectData } from "../../../test/graphql"

const SET_FAVORITE_TEAMS = /* GraphQL */ `
	mutation SetFavoriteTeams($teamIds: [ID!]!) {
		setFavoriteTeams(teamIds: $teamIds) {
			__typename
			... on User { favoriteTeams { id } }
			... on ValidationError { message }
			... on NotFoundError { message }
		}
	}
`

const PROFILE_TEAMS = /* GraphQL */ `
	query ProfileTeams($username: String!) {
		userByUsername(username: $username) { favoriteTeams { id } }
	}
`

const MARK_PROMPT_SEEN = /* GraphQL */ `
	mutation MarkTeamsPromptSeen {
		markTeamsPromptSeen {
			__typename
			... on User { teamsPromptSeenAt }
		}
	}
`

const VIEWER_ONBOARDING = /* GraphQL */ `
	query ViewerOnboarding {
		viewerOnboarding {
			... on ViewerOnboarding { hasFavoriteTeams }
		}
	}
`

type SetResult = {
	setFavoriteTeams: {
		__typename: string
		favoriteTeams?: { id: string }[]
		message?: string
	}
}

describe("setFavoriteTeams", () => {
	it("saves teams across leagues in the order given", async () => {
		const user = await makeUser()
		const a = await makeTeam()
		const b = await makeTeam({ leagueId: (await makeLeague()).id })
		const c = await makeTeam({ leagueId: a.leagueId })

		const data = await expectData<SetResult>(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [c.id, a.id, b.id] },
		})

		expect(data.setFavoriteTeams.favoriteTeams?.map((t) => t.id)).toEqual([
			c.id,
			a.id,
			b.id,
		])
	})

	it("replaces the previous list rather than adding to it", async () => {
		const user = await makeUser()
		const a = await makeTeam()
		const b = await makeTeam()
		await expectData(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [a.id] },
		})

		const data = await expectData<SetResult>(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [b.id] },
		})

		expect(data.setFavoriteTeams.favoriteTeams?.map((t) => t.id)).toEqual([
			b.id,
		])
	})

	it("clears the list when given nothing", async () => {
		const user = await makeUser()
		const a = await makeTeam()
		await expectData(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [a.id] },
		})

		const data = await expectData<SetResult>(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [] },
		})

		expect(data.setFavoriteTeams.favoriteTeams).toEqual([])
	})

	it("keeps the first position of a repeated id", async () => {
		const user = await makeUser()
		const a = await makeTeam()
		const b = await makeTeam()

		const data = await expectData<SetResult>(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [a.id, b.id, a.id] },
		})

		expect(data.setFavoriteTeams.favoriteTeams?.map((t) => t.id)).toEqual([
			a.id,
			b.id,
		])
	})

	it("rejects more than the cap", async () => {
		const user = await makeUser()
		const league = await makeLeague()
		const many = await Promise.all(
			Array.from({ length: MAX_FAVORITE_TEAMS + 1 }, () =>
				makeTeam({ leagueId: league.id }),
			),
		)

		const data = await expectData<SetResult>(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: many.map((t) => t.id) },
		})

		expect(data.setFavoriteTeams.__typename).toBe("ValidationError")
	})

	it("doesn't count a repeated id against the cap", async () => {
		const user = await makeUser()
		const league = await makeLeague()
		const teams = await Promise.all(
			Array.from({ length: MAX_FAVORITE_TEAMS }, () =>
				makeTeam({ leagueId: league.id }),
			),
		)
		const ids = teams.map((t) => t.id)

		const data = await expectData<SetResult>(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [...ids, ids[0]] },
		})

		expect(data.setFavoriteTeams.favoriteTeams).toHaveLength(MAX_FAVORITE_TEAMS)
	})

	it("rejects a team that doesn't exist and leaves the list alone", async () => {
		const user = await makeUser()
		const a = await makeTeam()
		await expectData(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [a.id] },
		})

		const data = await expectData<SetResult>(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [crypto.randomUUID()] },
		})
		expect(data.setFavoriteTeams.__typename).toBe("NotFoundError")

		const profile = await expectData<{
			userByUsername: { favoriteTeams: { id: string }[] }
		}>(PROFILE_TEAMS, { variables: { username: user.username } })
		expect(profile.userByUsername.favoriteTeams.map((t) => t.id)).toEqual([
			a.id,
		])
	})

	it("requires a signed-in user", async () => {
		const a = await makeTeam()

		const data = await expectData<SetResult>(SET_FAVORITE_TEAMS, {
			variables: { teamIds: [a.id] },
		})

		expect(data.setFavoriteTeams.__typename).toBe("AuthenticationError")
	})

	it("shows on the profile to other viewers", async () => {
		const user = await makeUser()
		const other = await makeUser()
		const a = await makeTeam()
		await expectData(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [a.id] },
		})

		const profile = await expectData<{
			userByUsername: { favoriteTeams: { id: string }[] }
		}>(PROFILE_TEAMS, { as: other, variables: { username: user.username } })

		expect(profile.userByUsername.favoriteTeams.map((t) => t.id)).toEqual([
			a.id,
		])
	})
})

describe("hasFavoriteTeams", () => {
	it("flips once the user has saved a team", async () => {
		const user = await makeUser()
		const a = await makeTeam()

		const before = await expectData<{
			viewerOnboarding: { hasFavoriteTeams: boolean }
		}>(VIEWER_ONBOARDING, { as: user })
		expect(before.viewerOnboarding.hasFavoriteTeams).toBe(false)

		await expectData(SET_FAVORITE_TEAMS, {
			as: user,
			variables: { teamIds: [a.id] },
		})

		const after = await expectData<{
			viewerOnboarding: { hasFavoriteTeams: boolean }
		}>(VIEWER_ONBOARDING, { as: user })
		expect(after.viewerOnboarding.hasFavoriteTeams).toBe(true)
	})
})

describe("markTeamsPromptSeen", () => {
	it("keeps the first time it was stamped", async () => {
		const user = await makeUser()

		const first = await expectData<{
			markTeamsPromptSeen: { teamsPromptSeenAt: string }
		}>(MARK_PROMPT_SEEN, { as: user })
		const second = await expectData<{
			markTeamsPromptSeen: { teamsPromptSeenAt: string }
		}>(MARK_PROMPT_SEEN, { as: user })

		expect(first.markTeamsPromptSeen.teamsPromptSeenAt).toBeTruthy()
		expect(second.markTeamsPromptSeen.teamsPromptSeenAt).toBe(
			first.markTeamsPromptSeen.teamsPromptSeenAt,
		)
	})
})
