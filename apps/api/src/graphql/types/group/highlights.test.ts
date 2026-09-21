import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { type User, userStreaks, userSweeps } from "../../../db/schema"
import {
	makeGroup,
	makeLeague,
	makeSeason,
	makeStreak,
	makeUser,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"

// The highlights band on a group page: who's hot, who's cold, who just swept.
// Bound by the group's tracked leagues and nothing else - unlike the
// leaderboard there's no league tab or season to narrow it, because a streak
// has no season to filter by.

const HIGHLIGHTS = /* GraphQL */ `
	query Highlights($groupId: ID!, $limit: Int) {
		group(id: $groupId) {
			hotStreaks(limit: $limit) {
				currentLength
				bestLength
				familyLabel
				user { username }
				league { abbreviation }
			}
			coldStreaks(limit: $limit) {
				currentColdLength
				worstColdLength
				user { username }
			}
			streakRecords(limit: $limit) {
				bestLength
				user { username }
			}
			recentSweeps(limit: $limit) {
				gameCount
				slateLabel
				user { username }
			}
		}
	}
`

type Highlights = {
	group: {
		hotStreaks: {
			currentLength: number
			bestLength: number
			familyLabel: string
			user: { username: string }
			league: { abbreviation: string }
		}[]
		coldStreaks: {
			currentColdLength: number
			worstColdLength: number
			user: { username: string }
		}[]
		streakRecords: { bestLength: number; user: { username: string } }[]
		recentSweeps: {
			gameCount: number
			slateLabel: string
			user: { username: string }
		}[]
	}
}

const highlightsFor = (groupId: string, as: User, limit?: number) =>
	expectData<Highlights>(HIGHLIGHTS, {
		as,
		variables: { groupId, limit: limit ?? null },
	})

describe("group highlights", () => {
	it("ranks members' live runs hottest first, and names the track", async () => {
		const [admin, hotter, cooler] = await Promise.all([
			makeUser(),
			makeUser(),
			makeUser(),
		])
		const league = await makeLeague()
		const group = await makeGroup({ admin: admin, members: [hotter, cooler] })
		await makeStreak({
			userId: hotter.id,
			leagueId: league.id,
			lastSettledAt: new Date(),
			currentLength: 7,
			bestLength: 9,
		})
		await makeStreak({
			userId: cooler.id,
			leagueId: league.id,
			lastSettledAt: new Date(),
			currentLength: 4,
			bestLength: 4,
		})

		const { group: data } = await highlightsFor(group.id, admin)
		expect(data.hotStreaks).toEqual([
			{
				currentLength: 7,
				bestLength: 9,
				familyLabel: "Winners",
				user: { username: hotter.username },
				league: { abbreviation: league.abbreviation },
			},
			{
				currentLength: 4,
				bestLength: 4,
				familyLabel: "Winners",
				user: { username: cooler.username },
				league: { abbreviation: league.abbreviation },
			},
		])
	})

	it("leaves a run shorter than HOT_STREAK_MIN off the hot list", async () => {
		const [admin, member] = await Promise.all([makeUser(), makeUser()])
		const league = await makeLeague()
		const group = await makeGroup({ admin: admin, members: [member] })
		await makeStreak({
			userId: member.id,
			leagueId: league.id,
			lastSettledAt: new Date(),
			currentLength: 2,
			bestLength: 2,
		})

		const { group: data } = await highlightsFor(group.id, admin)
		expect(data.hotStreaks).toEqual([])
		expect(data.streakRecords).toEqual([])
	})

	it("lists a cold-only track, which never reaches the hot list", async () => {
		const [admin, member] = await Promise.all([makeUser(), makeUser()])
		const league = await makeLeague()
		const group = await makeGroup({ admin: admin, members: [member] })
		// Nothing but misses: bestLength stays 0, so this track is invisible to
		// every hot list but is exactly what the cold one is for.
		await makeStreak({
			userId: member.id,
			leagueId: league.id,
			lastSettledAt: new Date(),
			currentColdLength: 5,
			worstColdLength: 5,
		})

		const { group: data } = await highlightsFor(group.id, admin)
		expect(data.hotStreaks).toEqual([])
		expect(data.streakRecords).toEqual([])
		expect(data.coldStreaks).toEqual([
			{
				currentColdLength: 5,
				worstColdLength: 5,
				user: { username: member.username },
			},
		])
	})

	it("keeps the records list when no run is live, so the band has a fallback", async () => {
		const [admin, member] = await Promise.all([makeUser(), makeUser()])
		const league = await makeLeague()
		const group = await makeGroup({ admin: admin, members: [member] })
		// A run that ended: nothing current, but a best worth remembering.
		await makeStreak({
			userId: member.id,
			leagueId: league.id,
			lastSettledAt: new Date(),
			currentLength: 0,
			bestLength: 6,
			currentColdLength: 1,
			worstColdLength: 1,
		})

		const { group: data } = await highlightsFor(group.id, admin)
		expect(data.hotStreaks).toEqual([])
		expect(data.streakRecords).toEqual([
			{ bestLength: 6, user: { username: member.username } },
		])
	})

	it("counts only the group's tracked leagues", async () => {
		const [admin, member] = await Promise.all([makeUser(), makeUser()])
		const [tracked, untracked] = await Promise.all([makeLeague(), makeLeague()])
		const group = await makeGroup({
			admin: admin,
			members: [member],
			leagueIds: [tracked.id],
		})
		await makeStreak({
			userId: member.id,
			leagueId: tracked.id,
			lastSettledAt: new Date(),
			currentLength: 5,
			bestLength: 5,
		})
		await db.insert(userStreaks).values({
			userId: member.id,
			leagueId: untracked.id,
			family: "player_stats" as const,
			currentLength: 9,
			bestLength: 9,
			lastSettledAt: new Date(),
		})

		const { group: data } = await highlightsFor(group.id, admin)
		expect(data.hotStreaks).toHaveLength(1)
		expect(data.hotStreaks[0]?.league.abbreviation).toBe(tracked.abbreviation)
	})

	it("leaves out a streak belonging to someone outside the group", async () => {
		const [admin, outsider] = await Promise.all([makeUser(), makeUser()])
		const league = await makeLeague()
		const group = await makeGroup({ admin: admin })
		await makeStreak({
			userId: outsider.id,
			leagueId: league.id,
			lastSettledAt: new Date(),
			currentLength: 8,
			bestLength: 8,
		})

		const { group: data } = await highlightsFor(group.id, admin)
		expect(data.hotStreaks).toEqual([])
	})

	it("lists sweeps newest first and honours the limit", async () => {
		const [admin, member] = await Promise.all([makeUser(), makeUser()])
		const league = await makeLeague()
		const season = await makeSeason({ leagueId: league.id })
		const group = await makeGroup({ admin: admin, members: [member] })
		await db.insert(userSweeps).values([
			{
				userId: member.id,
				leagueId: league.id,
				slateKey: "older",
				seasonId: season.id,
				gameCount: 4,
				firstStartsAt: new Date("2026-09-01T17:00:00Z"),
				settledAt: new Date("2026-09-01T23:00:00Z"),
			},
			{
				userId: member.id,
				leagueId: league.id,
				slateKey: "newer",
				seasonId: season.id,
				gameCount: 6,
				firstStartsAt: new Date("2026-09-08T17:00:00Z"),
				settledAt: new Date("2026-09-08T23:00:00Z"),
			},
		])

		const { group: all } = await highlightsFor(group.id, admin)
		expect(all.recentSweeps.map((s) => s.gameCount)).toEqual([6, 4])

		const { group: capped } = await highlightsFor(group.id, admin, 1)
		expect(capped.recentSweeps.map((s) => s.gameCount)).toEqual([6])
	})
})
