import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { syncFlairCatalog } from "../../db/catalog/flairs"
import {
	BASE_POINTS_BY_SHAPE,
	pointsCommitted,
	STREAK_BONUS_SHARE,
	STREAK_BONUS_STEP,
	SWEEP_BONUS_SHARE,
} from "@called-my-shot/scoring"
import { and, eq } from "drizzle-orm"
import {
	type PointAwardKind,
	pointAwards,
	type Question,
	streakRecomputeQueue,
	sweepRecomputeQueue,
	userFlairs,
} from "../../db/schema"
import {
	makeAdmin,
	makeCall,
	makeGame,
	makeLeague,
	makeOption,
	makeQuestion,
	makeSeason,
	makeSelection,
	makeUser,
	pastDate,
} from "../../test/factories"
import { expectData } from "../../test/graphql"
import { generationKey } from "../game-questions/generation-key"
import { resolveQuestionInternal } from "../resolve-question"
import { markQuestionVoided } from "../void-question"
import { enqueueAchievementRecomputes } from "./backfill"
import { drainAchievementRecomputes } from "./drain"

async function seedLeague() {
	const league = await makeLeague({ windowType: "week" })
	const season = await makeSeason({ leagueId: league.id })
	return { league, season }
}
type SeededLeague = Awaited<ReturnType<typeof seedLeague>>

// A finished game in the league's week 1 Sunday Early slot, with the who-wins
// question the sync posts on it. `hoursAgo` is when the game went final, which
// is what orders a track - kept inside the window a change is announced in.
async function seedWinnerGame(
	{ league, season }: SeededLeague,
	hoursAgo: number,
	overrides: { status?: Question["status"] } = {},
) {
	const startsAt = pastDate(hoursAgo + 3)
	const game = await makeGame({
		leagueId: league.id,
		seasonId: season.id,
		startsAt,
		finalizedAt: pastDate(hoursAgo),
		status: "final",
		weekNumber: 1,
		slot: "SUN_EARLY",
	})
	const question = await makeQuestion({
		leagueId: league.id,
		seasonId: season.id,
		gameId: game.id,
		shape: "team_vs_team",
		resolutionMode: "system",
		isOfficial: true,
		generationKey: generationKey([league.slug, game.id, "team_vs_team"]),
		status: overrides.status ?? "locked",
		locksAt: startsAt,
	})
	const home = await makeOption(question.id, { label: "Home", sortOrder: 0 })
	const away = await makeOption(question.id, { label: "Away", sortOrder: 1 })
	return { game, question, home, away }
}

async function pick(question: Question, userId: string, optionId: string) {
	const call = await makeCall(question.id, userId)
	await makeSelection(call.id, optionId)
	return call
}

const resolve = (question: Question, correctOptionId: string) =>
	db.transaction((tx) =>
		resolveQuestionInternal(
			tx,
			question,
			{ correctOptionIds: [correctOptionId], resolutionNote: "" },
			{ resolvedBy: { method: "system" } },
		),
	)

const winnersStreak = (userId: string) =>
	db.query.userStreaks.findFirst({ where: { userId, family: "winners" } })

const notificationsOf = (
	userId: string,
	type: "streak_milestone" | "sweep_completed",
) => db.query.notifications.findMany({ where: { userId, type } })

describe("streak tracks", () => {
	it("counts wins in the order their games went final", async () => {
		const league = await seedLeague()
		const user = await makeUser()
		for (const hoursAgo of [30, 20, 10]) {
			const { question, home } = await seedWinnerGame(league, hoursAgo)
			await pick(question, user.id, home.id)
			await resolve(question, home.id)
		}
		await drainAchievementRecomputes()

		const streak = await winnersStreak(user.id)
		expect(streak?.currentLength).toBe(3)
		expect(streak?.bestLength).toBe(3)
		const positions = await db.query.callStreakPositions.findMany({
			where: { userId: user.id },
		})
		expect(positions.map((p) => p.length).sort()).toEqual([1, 2, 3])
		expect(await db.select().from(streakRecomputeQueue)).toHaveLength(0)
	})

	it("leaves out a question a person grades", async () => {
		const { league, season } = await seedLeague()
		const user = await makeUser()
		const game = await makeGame({ leagueId: league.id, seasonId: season.id })
		const question = await makeQuestion({
			leagueId: league.id,
			seasonId: season.id,
			gameId: game.id,
			shape: "team_vs_team",
			resolutionMode: "manual",
			status: "locked",
		})
		const home = await makeOption(question.id, { label: "Home" })
		await pick(question, user.id, home.id)
		await resolve(question, home.id)

		expect(await db.select().from(streakRecomputeQueue)).toHaveLength(0)
		await drainAchievementRecomputes()
		expect(await winnersStreak(user.id)).toBeUndefined()
	})

	it("rewrites the track when an overturn flips a result in the middle", async () => {
		const league = await seedLeague()
		const user = await makeUser()
		const games = []
		for (const hoursAgo of [30, 20, 10]) {
			const seeded = await seedWinnerGame(league, hoursAgo)
			await pick(seeded.question, user.id, seeded.home.id)
			games.push({
				...seeded,
				question: await resolve(seeded.question, seeded.home.id),
			})
		}
		await drainAchievementRecomputes()

		const middle = games[1]
		if (!middle) throw new Error("missing game")
		await resolve(middle.question, middle.away.id)
		await drainAchievementRecomputes()

		const streak = await winnersStreak(user.id)
		expect(streak?.currentLength).toBe(1)
		expect(streak?.bestLength).toBe(1)
		expect(
			await db.query.callStreakPositions.findMany({
				where: { userId: user.id },
			}),
		).toHaveLength(2)
	})

	it("joins a run back together when the miss inside it is voided", async () => {
		const league = await seedLeague()
		const user = await makeUser()
		const first = await seedWinnerGame(league, 30)
		const miss = await seedWinnerGame(league, 20)
		const last = await seedWinnerGame(league, 10)
		await pick(first.question, user.id, first.home.id)
		await pick(miss.question, user.id, miss.home.id)
		await pick(last.question, user.id, last.home.id)
		await resolve(first.question, first.home.id)
		const resolvedMiss = await resolve(miss.question, miss.away.id)
		await resolve(last.question, last.home.id)
		await drainAchievementRecomputes()
		expect((await winnersStreak(user.id))?.currentLength).toBe(1)

		await db.transaction((tx) =>
			markQuestionVoided(tx, resolvedMiss, {
				reason: "game_not_completed",
				note: "",
				voidedBy: { method: "system" },
			}),
		)
		await drainAchievementRecomputes()
		expect((await winnersStreak(user.id))?.currentLength).toBe(2)
	})

	it("rebuilds a track once one of its questions is deleted", async () => {
		const league = await seedLeague()
		const user = await makeUser()
		const kept = await seedWinnerGame(league, 20)
		const deleted = await seedWinnerGame(league, 10)
		for (const { question, home } of [kept, deleted]) {
			await pick(question, user.id, home.id)
			await resolve(question, home.id)
		}
		await drainAchievementRecomputes()
		expect((await winnersStreak(user.id))?.currentLength).toBe(2)

		const data = await expectData<{ deleteQuestion: { __typename: string } }>(
			/* GraphQL */ `
				mutation Delete($input: DeleteQuestionInput!) {
					deleteQuestion(input: $input) { __typename }
				}
			`,
			{
				as: await makeAdmin(),
				variables: { input: { questionId: deleted.question.id } },
			},
		)
		expect(data.deleteQuestion.__typename).toBe("DeleteQuestionPayload")
		await drainAchievementRecomputes()
		expect((await winnersStreak(user.id))?.currentLength).toBe(1)
	})
})

describe("streak notifications", () => {
	it("announces a milestone once, however many times the track is rebuilt", async () => {
		const league = await seedLeague()
		const user = await makeUser()
		for (const hoursAgo of [40, 30, 20, 10, 5]) {
			const { question, home } = await seedWinnerGame(league, hoursAgo)
			await pick(question, user.id, home.id)
			await resolve(question, home.id)
			await drainAchievementRecomputes()
		}
		expect(await notificationsOf(user.id, "streak_milestone")).toHaveLength(1)

		await enqueueAchievementRecomputes({ since: null })
		await drainAchievementRecomputes()
		expect(await notificationsOf(user.id, "streak_milestone")).toHaveLength(1)
		// Five games in one slot is a sweep too, which has a notice of its own.
		const milestoneNotices = (
			await db.query.achievementNotices.findMany({
				where: { userId: user.id },
			})
		).filter((notice) => notice.dedupeKey.startsWith("milestone:"))
		expect(milestoneNotices).toHaveLength(1)
		expect(milestoneNotices[0]?.notificationId).not.toBeNull()
	})

	it("announces nothing from a rebuild with notifications off", async () => {
		const league = await seedLeague()
		const user = await makeUser()
		for (const hoursAgo of [40, 30, 20, 10]) {
			const { question, home } = await seedWinnerGame(league, hoursAgo)
			await pick(question, user.id, home.id)
			await resolve(question, home.id)
			await drainAchievementRecomputes()
		}
		const fifth = await seedWinnerGame(league, 5)
		await pick(fifth.question, user.id, fifth.home.id)
		await resolve(fifth.question, fifth.home.id)
		await db.delete(streakRecomputeQueue)
		await db.delete(sweepRecomputeQueue)

		await enqueueAchievementRecomputes({ since: null })
		await drainAchievementRecomputes({ notify: false })
		expect((await winnersStreak(user.id))?.currentLength).toBe(5)
		expect(await notificationsOf(user.id, "streak_milestone")).toHaveLength(0)
	})
})

describe("sweeps", () => {
	it("records and announces a sweep once, through an overturn and back", async () => {
		const league = await seedLeague()
		const sweeper = await makeUser()
		const contrarian = await makeUser()
		const games = []
		for (const [index, hoursAgo] of [30, 20, 10].entries()) {
			const seeded = await seedWinnerGame(league, hoursAgo)
			await pick(seeded.question, sweeper.id, seeded.home.id)
			await pick(
				seeded.question,
				contrarian.id,
				index === 1 ? seeded.away.id : seeded.home.id,
			)
			games.push({
				...seeded,
				question: await resolve(seeded.question, seeded.home.id),
			})
		}
		await drainAchievementRecomputes()

		const sweepsOf = (userId: string) =>
			db.query.userSweeps.findMany({ where: { userId } })
		expect(await sweepsOf(sweeper.id)).toEqual([
			expect.objectContaining({ gameCount: 3 }),
		])
		expect(await sweepsOf(contrarian.id)).toHaveLength(0)
		expect(await notificationsOf(sweeper.id, "sweep_completed")).toHaveLength(1)

		const middle = games[1]
		if (!middle) throw new Error("missing game")
		const overturned = await resolve(middle.question, middle.away.id)
		await drainAchievementRecomputes()
		expect(await sweepsOf(sweeper.id)).toHaveLength(0)
		expect(await sweepsOf(contrarian.id)).toHaveLength(1)

		await resolve(overturned, middle.home.id)
		await drainAchievementRecomputes()
		expect(await sweepsOf(sweeper.id)).toHaveLength(1)
		expect(await notificationsOf(sweeper.id, "sweep_completed")).toHaveLength(1)
	})

	it("waits for every game in the slate", async () => {
		const league = await seedLeague()
		const user = await makeUser()
		for (const hoursAgo of [30, 20, 10]) {
			const { question, home } = await seedWinnerGame(league, hoursAgo)
			await pick(question, user.id, home.id)
			await resolve(question, home.id)
		}
		const pending = await seedWinnerGame(league, 1)
		await pick(pending.question, user.id, pending.home.id)
		await drainAchievementRecomputes()

		expect(
			await db.query.userSweeps.findMany({ where: { userId: user.id } }),
		).toHaveLength(0)
	})
})

describe("point awards", () => {
	const awardsOf = (userId: string, kind: PointAwardKind) =>
		db
			.select()
			.from(pointAwards)
			.where(and(eq(pointAwards.userId, userId), eq(pointAwards.kind, kind)))
	const bonusOf = async (userId: string) =>
		(await db.query.userSeasonStats.findFirst({ where: { userId } }))
			?.bonusPoints ?? 0
	// What every one of a user's winner calls committed.
	const committedOf = async (userId: string) => {
		const rows = await db.query.calls.findMany({
			where: { userId },
			with: { selections: { columns: { conviction: true } } },
		})
		return rows.flatMap((call) =>
			call.selections.map((s) =>
				pointsCommitted(BASE_POINTS_BY_SHAPE.team_vs_team, s.conviction),
			),
		)
	}
	const total = (values: number[]) => values.reduce((a, b) => a + b, 0)

	it("pays a streak milestone and a sweep, and takes both back on an overturn", async () => {
		const league = await seedLeague()
		const user = await makeUser()
		const games = []
		for (let index = 0; index < STREAK_BONUS_STEP; index++) {
			const seeded = await seedWinnerGame(league, 50 - index * 5)
			await pick(seeded.question, user.id, seeded.home.id)
			games.push({
				...seeded,
				question: await resolve(seeded.question, seeded.home.id),
			})
		}
		await drainAchievementRecomputes()

		const committed = total(await committedOf(user.id))
		const streak = Math.round(committed * STREAK_BONUS_SHARE)
		const sweep = Math.round(committed * SWEEP_BONUS_SHARE)
		// Both dated by the last game to go final: the milestone win, and the
		// game that settled the slate.
		const lastGameId = games.at(-1)?.game.id
		expect(await awardsOf(user.id, "streak_milestone")).toEqual([
			expect.objectContaining({ points: streak, gameId: lastGameId }),
		])
		expect(await awardsOf(user.id, "sweep")).toEqual([
			expect.objectContaining({ points: sweep, gameId: lastGameId }),
		])
		expect(await bonusOf(user.id)).toBe(streak + sweep)

		const middle = games[2]
		if (!middle) throw new Error("missing game")
		await resolve(middle.question, middle.away.id)
		await drainAchievementRecomputes()

		expect(await awardsOf(user.id, "streak_milestone")).toHaveLength(0)
		expect(await awardsOf(user.id, "sweep")).toHaveLength(0)
		expect(await bonusOf(user.id)).toBe(0)
	})

	it("leaves the awards as they are when the backfill rebuilds them again", async () => {
		const league = await seedLeague()
		const user = await makeUser()
		for (let index = 0; index < STREAK_BONUS_STEP; index++) {
			const seeded = await seedWinnerGame(league, 50 - index * 5)
			await pick(seeded.question, user.id, seeded.home.id)
			await resolve(seeded.question, seeded.home.id)
		}
		await drainAchievementRecomputes()
		const before = await db.select().from(pointAwards)
		const bonus = await bonusOf(user.id)

		await enqueueAchievementRecomputes({ since: null })
		await drainAchievementRecomputes({ notify: false })

		expect(await db.select().from(pointAwards)).toEqual(before)
		expect(await bonusOf(user.id)).toBe(bonus)
	})
})

// The flair grants ride along with the rebuild that computes the streak, so
// they're covered here rather than in a suite of their own.
describe("achievement flairs", () => {
	const grantsOf = (userId: string) =>
		db.query.userFlairs.findMany({
			where: { userId },
			with: { flair: { columns: { key: true } } },
		})

	async function winStreak(userId: string, wins: number) {
		const league = await seedLeague()
		for (let i = 0; i < wins; i++) {
			const { question, home } = await seedWinnerGame(league, 100 - i)
			await pick(question, userId, home.id)
			await resolve(question, home.id)
		}
		await drainAchievementRecomputes()
	}

	it("grants the thresholds a run clears and no more", async () => {
		await syncFlairCatalog()
		const user = await makeUser()

		await winStreak(user.id, 5)

		const keys = (await grantsOf(user.id)).map((row) => row.flair?.key)
		expect(keys).toContain("streak:5")
		expect(keys).not.toContain("streak:10")
		expect(keys).not.toContain("streak:25")
	})

	// Every question that settles rebuilds the whole track, so the same run is
	// re-detected constantly. Only the first detection may write.
	it("leaves one row when the track is rebuilt again", async () => {
		await syncFlairCatalog()
		const user = await makeUser()

		await winStreak(user.id, 5)
		await enqueueAchievementRecomputes({ since: null })
		await drainAchievementRecomputes()

		const grants = await grantsOf(user.id)
		expect(grants.filter((g) => g.flair?.key === "streak:5")).toHaveLength(1)
	})

	// The backfill runs with notify off, and history earned before flairs
	// existed should still be rewarded.
	it("grants with notify off", async () => {
		await syncFlairCatalog()
		const user = await makeUser()

		await winStreak(user.id, 5)
		await db.delete(userFlairs)
		await enqueueAchievementRecomputes({ since: null })
		await drainAchievementRecomputes({ notify: false })

		const keys = (await grantsOf(user.id)).map((row) => row.flair?.key)
		expect(keys).toContain("streak:5")
	})

	it("grants a sweep", async () => {
		await syncFlairCatalog()
		const league = await seedLeague()
		const user = await makeUser()
		for (const hoursAgo of [30, 20, 10]) {
			const { question, home } = await seedWinnerGame(league, hoursAgo)
			await pick(question, user.id, home.id)
			await resolve(question, home.id)
		}
		await drainAchievementRecomputes()

		const keys = (await grantsOf(user.id)).map((row) => row.flair?.key)
		expect(keys).toContain("sweep:first")
	})
})
