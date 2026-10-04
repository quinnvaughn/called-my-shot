import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { pointAwards } from "../db/schema"
import { makeGame, makeLeague, makeSeason, makeUser } from "../test/factories"
import { pointAwardScope, reconcileAwards } from "./point-awards"

const awardsOf = (userId: string) =>
	db.select().from(pointAwards).where(eq(pointAwards.userId, userId))

const bonusOf = async (userId: string) =>
	(await db.query.userSeasonStats.findFirst({ where: { userId } }))
		?.bonusPoints ?? 0

describe("reconcileAwards", () => {
	it("moves the points when an award is replaced, and leaves an unchanged one alone", async () => {
		const user = await makeUser()
		const league = await makeLeague()
		const season = await makeSeason({ leagueId: league.id })
		const award = {
			userId: user.id,
			leagueId: league.id,
			seasonId: season.id,
			sourceKey: user.id,
			gameId: null as string | null,
			points: 30,
		}
		const scope = pointAwardScope.slate(league.id, "day:2026-09-20")
		const reconcile = (desired: (typeof award)[]) =>
			db.transaction((tx) => reconcileAwards(tx, "sweep", scope, desired))

		await reconcile([award])
		const [first] = await awardsOf(user.id)

		await reconcile([award])
		const [same] = await awardsOf(user.id)
		expect(same?.id).toBe(first?.id)
		expect(await bonusOf(user.id)).toBe(30)

		await reconcile([{ ...award, points: 50 }])
		expect(await bonusOf(user.id)).toBe(50)

		// Moving an award to another game replaces the row without moving the
		// season total.
		const game = await makeGame({ leagueId: league.id, seasonId: season.id })
		await reconcile([{ ...award, points: 50, gameId: game.id }])
		const [moved] = await awardsOf(user.id)
		expect(moved?.gameId).toBe(game.id)
		expect(await bonusOf(user.id)).toBe(50)

		await reconcile([])
		expect(await awardsOf(user.id)).toHaveLength(0)
		expect(await bonusOf(user.id)).toBe(0)
	})
})
