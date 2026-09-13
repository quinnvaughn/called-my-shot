import { describe, expect, it } from "vitest"
import { db } from "../../db"
import {
	groupMembers,
	groups,
	type User,
	userSeasonStats,
} from "../../db/schema"
import { makeLeague, makeSeason, makeUser } from "../../test/factories"
import { expectData } from "../../test/graphql"

// A rank is a settled record: nobody is ranked until one of their calls
// resolves, so a user whose calls are all pending can't sit at 0 above
// someone who is playing and slightly negative.

const ALL_TIME = { scope: "ALL_TIME" }

async function leagueWithSeason() {
	const league = await makeLeague()
	const season = await makeSeason({ leagueId: league.id })
	return {
		resolved: (user: User, points: number) =>
			db.insert(userSeasonStats).values({
				userId: user.id,
				leagueId: league.id,
				seasonId: season.id,
				points,
				callCount: 1,
				resolvedCallCount: 1,
				correctCount: points > 0 ? 1 : 0,
			}),
		pending: (user: User) =>
			db.insert(userSeasonStats).values({
				userId: user.id,
				leagueId: league.id,
				seasonId: season.id,
				points: 0,
				callCount: 1,
				resolvedCallCount: 0,
				correctCount: 0,
			}),
	}
}

const SITE_BOARD = /* GraphQL */ `
	query SiteBoard($season: SeasonFilterInput) {
		leaderboard(season: $season) {
			items {
				rank
				user { id }
			}
		}
		viewerLeaderboardEntry(season: $season) {
			rank
			totalPoints
		}
	}
`

type SiteBoard = {
	leaderboard: { items: { rank: number; user: { id: string } }[] }
	viewerLeaderboardEntry: { rank: number | null; totalPoints: number } | null
}

const CAREER = /* GraphQL */ `
	query Career($username: String!) {
		userByUsername(username: $username) {
			careerStats { rank }
		}
	}
`

type Career = {
	userByUsername: { careerStats: { rank: number | null } | null }
}

const GROUP_BOARD = /* GraphQL */ `
	query GroupBoard($groupId: ID!, $season: SeasonFilterInput) {
		group(id: $groupId) {
			viewerRank
			leaderboard(season: $season) {
				items {
					rank
					user { id }
				}
			}
			viewerLeaderboardEntry(season: $season) { rank }
		}
	}
`

type GroupBoard = {
	group: {
		viewerRank: number | null
		leaderboard: { items: { rank: number; user: { id: string } }[] }
		viewerLeaderboardEntry: { rank: number | null } | null
	}
}

describe("site leaderboard ranking", () => {
	it("leaves pending-only users off and ranks everyone else contiguously", async () => {
		const { resolved, pending } = await leagueWithSeason()
		const ahead = await makeUser()
		const behind = await makeUser()
		const waiting = await makeUser()
		await resolved(ahead, 10)
		await resolved(behind, -5)
		await pending(waiting)

		const data = await expectData<SiteBoard>(SITE_BOARD, {
			as: behind,
			variables: { season: ALL_TIME },
		})

		expect(data.leaderboard.items).toEqual([
			{ rank: 1, user: { id: ahead.id } },
			{ rank: 2, user: { id: behind.id } },
		])
		expect(data.viewerLeaderboardEntry?.rank).toBe(2)
	})

	it("gives a signed-in viewer without a resolved call an unranked entry", async () => {
		const { pending } = await leagueWithSeason()
		const waiting = await makeUser()
		const newcomer = await makeUser()
		await pending(waiting)

		for (const viewer of [waiting, newcomer]) {
			const data = await expectData<SiteBoard>(SITE_BOARD, {
				as: viewer,
				variables: { season: ALL_TIME },
			})
			expect(data.viewerLeaderboardEntry).toEqual({
				rank: null,
				totalPoints: 0,
			})
		}

		const signedOut = await expectData<SiteBoard>(SITE_BOARD, {
			variables: { season: ALL_TIME },
		})
		expect(signedOut.viewerLeaderboardEntry).toBeNull()
	})

	it("gives career stats the same rank as the board", async () => {
		const { resolved, pending } = await leagueWithSeason()
		const ahead = await makeUser()
		const behind = await makeUser()
		const waiting = await makeUser()
		await resolved(ahead, 10)
		await resolved(behind, -5)
		await pending(waiting)

		const ranked = await expectData<Career>(CAREER, {
			variables: { username: behind.username },
		})
		expect(ranked.userByUsername.careerStats?.rank).toBe(2)

		const unranked = await expectData<Career>(CAREER, {
			variables: { username: waiting.username },
		})
		expect(unranked.userByUsername.careerStats?.rank).toBeNull()
	})
})

describe("group leaderboard ranking", () => {
	it("leaves members without a resolved call off and unranked", async () => {
		const { resolved, pending } = await leagueWithSeason()
		const admin = await makeUser()
		const waiting = await makeUser()
		const idle = await makeUser()
		await resolved(admin, -3)
		await pending(waiting)
		const [group] = await db
			.insert(groups)
			.values({ name: "Test group", createdBy: admin.id })
			.returning()
		await db.insert(groupMembers).values([
			{ groupId: group.id, userId: admin.id, role: "admin" as const },
			{ groupId: group.id, userId: waiting.id, role: "member" as const },
			{ groupId: group.id, userId: idle.id, role: "member" as const },
		])

		for (const viewer of [waiting, idle]) {
			const data = await expectData<GroupBoard>(GROUP_BOARD, {
				as: viewer,
				variables: { groupId: group.id, season: ALL_TIME },
			})
			expect(data.group.leaderboard.items).toEqual([
				{ rank: 1, user: { id: admin.id } },
			])
			expect(data.group.viewerRank).toBeNull()
			expect(data.group.viewerLeaderboardEntry?.rank).toBeNull()
		}
	})
})
