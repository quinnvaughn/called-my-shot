import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { pointAwards, type User, userSweeps } from "../../../db/schema"
import { pointAwardScope } from "../../../lib/point-awards"
import {
	makeCall,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeStreak,
	makeUser,
} from "../../../test/factories"
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

describe("UserStreak run bonuses", () => {
	const BONUSES = /* GraphQL */ `
		query Bonuses($username: String!, $league: String!) {
			userByUsername(username: $username) {
				streak(league: $league, family: WINNERS) {
					currentRunBonus
					bestRunBonus
				}
			}
		}
	`

	it("sums each run's own milestone awards and nothing from another run", async () => {
		const user = await makeUser()
		const season = await makeSeason()
		const league = await db.query.leagues.findFirst({
			where: { id: season.leagueId },
		})
		const question = await makeQuestion({
			leagueId: season.leagueId,
			seasonId: season.id,
		})
		const bestStart = await makeCall(question.id, user.id)
		const currentStart = await makeCall(
			(await makeQuestion({ leagueId: season.leagueId, seasonId: season.id }))
				.id,
			user.id,
		)
		await makeStreak({
			userId: user.id,
			leagueId: season.leagueId,
			lastSettledAt: new Date(),
			currentLength: 6,
			currentStartCallId: currentStart.id,
			bestLength: 11,
			bestStartCallId: bestStart.id,
		})
		const scopeKey = pointAwardScope.streak(user.id, season.leagueId, "winners")
		const award = (sourceKey: string, points: number) => ({
			userId: user.id,
			leagueId: season.leagueId,
			seasonId: season.id,
			kind: "streak_milestone" as const,
			scopeKey,
			sourceKey,
			points,
		})
		await db
			.insert(pointAwards)
			.values([
				award(`${bestStart.id}:5`, 40),
				award(`${bestStart.id}:10`, 55),
				award(`${currentStart.id}:5`, 30),
			])

		const data = await expectData<{
			userByUsername: {
				streak: { currentRunBonus: number; bestRunBonus: number }
			}
		}>(BONUSES, {
			variables: { username: user.username, league: league?.slug ?? "" },
		})

		expect(data.userByUsername.streak).toEqual({
			currentRunBonus: 30,
			bestRunBonus: 95,
		})
	})
})

describe("UserSweep.bonus", () => {
	it("reads the sweep's own award and not another user's on the same slate", async () => {
		const [user, rival] = [await makeUser(), await makeUser()]
		const season = await makeSeason()
		const league = await db.query.leagues.findFirst({
			where: { id: season.leagueId },
		})
		const slateKey = "2026-09-13"
		await db.insert(userSweeps).values({
			userId: user.id,
			leagueId: season.leagueId,
			seasonId: season.id,
			slateKey,
			gameCount: 5,
			firstStartsAt: new Date(),
			settledAt: new Date(),
		})
		const award = (userId: string, points: number) => ({
			userId,
			leagueId: season.leagueId,
			seasonId: season.id,
			kind: "sweep" as const,
			scopeKey: pointAwardScope.slate(season.leagueId, slateKey),
			sourceKey: userId,
			points,
		})
		await db
			.insert(pointAwards)
			.values([award(user.id, 64), award(rival.id, 90)])

		const data = await expectData<{
			userByUsername: { sweep: { bonus: number } }
		}>(
			/* GraphQL */ `
				query SweepBonus($username: String!, $league: String!, $slateKey: String!) {
					userByUsername(username: $username) {
						sweep(league: $league, slateKey: $slateKey) { bonus }
					}
				}
			`,
			{
				variables: {
					username: user.username,
					league: league?.slug ?? "",
					slateKey,
				},
			},
		)

		expect(data.userByUsername.sweep.bonus).toBe(64)
	})
})
